const { app, BrowserWindow, ipcMain, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const url = require('url');
const os = require('os');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Suppress non-critical file-system errors (EPERM on logo/QR temp files)
// so they never pop up an Electron error dialog during login or printing.
process.on('uncaughtException', (err) => {
  const isFilePermissionError = err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EBUSY' || err.code === 'ENOENT';
  const isPrinterAsset = err.message && (
    err.message.includes('logo.png') ||
    err.message.includes('qr.png') ||
    err.message.includes('printer-assets') ||
    err.message.includes('printing') ||
    err.message.includes('temp')
  );

  if (isFilePermissionError && isPrinterAsset) {
    log.warn('[BizPOS] Suppressed non-critical file error during asset download:', err.message);
    return; // Don't crash — logo/QR is optional, printing still works without it
  }

  // For all other uncaught exceptions, log and show dialog as usual
  log.error('[BizPOS] Uncaught exception:', err);
  dialog.showErrorBox('BizPOS Error', `An unexpected error occurred:\n\n${err.message}`);
});

// Enable hot reload for Electron in development
const isDev = process.env.ELECTRON_IS_DEV === '1';
if (isDev) {
  try {
    require('electron-reloader')(module, {
      debug: true,
      watchRenderer: false, // Next.js handles renderer hot reload
      ignore: ['node_modules', 'out', '.next', 'dist']
    });
  } catch (err) {
    console.log('electron-reloader not available:', err.message);
  }
}

// Configure auto-updater logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
// Do NOT download automatically — a new release only downloads when the
// cashier clicks "Download" in the banner, so it never competes for bandwidth
// during urgent work. Once downloaded, install on quit as a fallback.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;
log.info('App starting...');

// Import handlers
const { registerPrinterHandlers } = require('./handlers/printerHandlers');
const { registerCustomerHandlers } = require('./handlers/customerHandlers');
const { registerReceiptPrinter } = require('./printing/receiptPrinter');
const { registerUSBPrinter } = require('./printing/usbPrinter');
const { registerUSBDetectionHandlers } = require('./handlers/usbDetection');
const { printKitchenToken } = require('./printing/kitchenTokenPrinter');
const { registerWhatsAppHandlers } = require('./whatsapp/whatsappHandlers');
const whatsAppClient = require('./whatsapp/whatsappClient');
const { registerAssetHandlers } = require('./handlers/assetHandlers');
const { registerBackupHandlers } = require('./handlers/backupHandler');
const { registerImageHandlers, getImageDir } = require('./handlers/imageHandler');
const { registerMobilePrintServer } = require('./printing/mobilePrintServer');
const { registerPRAHandlers } = require('./handlers/praHandler');

let mainWindow;

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  log.info('Checking for update...');
  if (mainWindow) {
    mainWindow.webContents.send('update-status', { status: 'checking' });
  }
});

autoUpdater.on('update-available', (info) => {
  log.info('Update available:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseDate: info.releaseDate
    });
  }
});

autoUpdater.on('update-not-available', (info) => {
  log.info('Update not available. Current version:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-not-available');
  }
});

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater:', err);
  if (mainWindow) {
    mainWindow.webContents.send('update-error', { message: err.message });
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  const logMessage = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
  log.info(logMessage);
  if (mainWindow) {
    mainWindow.webContents.send('update-download-progress', {
      percent: progressObj.percent,
      transferred: progressObj.transferred,
      total: progressObj.total,
      bytesPerSecond: progressObj.bytesPerSecond
    });
  }
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded. Version:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', {
      version: info.version
    });
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  
  mainWindow.setMenu(null);

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    const appPath = app.getAppPath();
    const outDir = path.join(appPath, 'out');

    const server = http.createServer((req, res) => {
      const parsed = url.parse(req.url);
      let pathname = decodeURIComponent(parsed.pathname);

      // ── Serve locally-cached product/deal images ──────────────────────
      if (pathname.startsWith('/local-images/')) {
        const filename = path.basename(pathname);
        const imgPath  = path.join(getImageDir(), filename);
        if (fs.existsSync(imgPath)) {
          const ext   = path.extname(filename).toLowerCase();
          const mimes = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
          res.setHeader('Content-Type', mimes[ext] || 'image/jpeg');
          // Local files are keyed by product id — content never changes for a given URL,
          // so tell the browser to cache forever and skip revalidation.
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          fs.createReadStream(imgPath).pipe(res);
        } else {
          res.writeHead(404); res.end('Not found');
        }
        return;
      }

      if (pathname.endsWith('/')) pathname += 'index.html';
      if (pathname === '/') pathname = '/index.html';

      const filePath = path.join(outDir, pathname);

      if (!filePath.startsWith(outDir)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }

      fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
          const dirIndex = path.join(outDir, pathname, 'index.html');
          fs.stat(dirIndex, (err2, stats2) => {
            if (err2 || !stats2.isFile()) {
              res.writeHead(404); res.end('Not found');
            } else {
              streamFile(dirIndex, res);
            }
          });
        } else {
          streamFile(filePath, res);
        }
      });
    });

    function streamFile(file, res) {
      const ext = path.extname(file).toLowerCase();
      const types = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.map': 'application/json',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
      };
      res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    }

    // CRITICAL: Use a fixed port so localStorage origin stays the same across restarts.
    // Port 0 (random) would assign a different port each time, wiping all offline orders
    // because localStorage is scoped by origin (protocol + host + port).
    const FIXED_PORT = 3939;

    const loadAppFromServer = () => {
      const { port } = server.address();
      const urlToLoad = `http://127.0.0.1:${port}/`;
      mainWindow.loadURL(urlToLoad).catch((err) => {
        console.error('Failed to load app:', err);
        mainWindow.loadURL('data:text/plain,Failed to load app');
      });
    };

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        log.error(`[BizPOS] Fixed port ${FIXED_PORT} is already in use. Another instance may already be running.`);
        dialog.showErrorBox(
          'BizPOS — Port In Use',
          `Port ${FIXED_PORT} is already in use.\n\nAnother instance of BizPOS may already be running.\n\nOffline orders cannot be saved if BizPOS starts on a different port each time.\n\nPlease close any other BizPOS windows and restart the app.`
        );
        app.quit();
      } else {
        log.error('[BizPOS] HTTP server error:', err.message);
      }
    });

    server.listen(FIXED_PORT, '127.0.0.1', loadAppFromServer);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // ── WhatsApp Auto-Connect on Startup ─────────────────────────────────────
  // DISABLED: WhatsApp is now a CENTRALIZED server-side socket (one per
  // restaurant on the admin server). This PC must NOT open its own Baileys
  // socket — doing so would consume a 4-device slot and conflict with the
  // shared session. Connection is driven from Supabase (whatsapp_connection)
  // and sends go through whatsapp_outbox. The local client is kept only for
  // local image rendering (whatsapp:render-* handlers), which need no socket.
  const USE_LOCAL_WHATSAPP = false;
  let whatsappAutoConnectDone = false;
  mainWindow.webContents.on('did-finish-load', () => {
    if (!USE_LOCAL_WHATSAPP) return;
    if (whatsappAutoConnectDone) return; // only once per window lifetime
    whatsappAutoConnectDone = true;

    // Baileys persists its session under whatsapp-baileys-auth/creds.json.
    // A paired session has registered:true (or a `me` id) — that's what we
    // auto-connect from. (The old whatsapp-session/session path belonged to
    // the retired Puppeteer client and never exists on fresh installs.)
    const credsPath = path.join(app.getPath('userData'), 'whatsapp-baileys-auth', 'creds.json');
    let hasValidSession = false;
    try {
      if (fs.existsSync(credsPath)) {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
        hasValidSession = creds?.registered === true || !!creds?.me?.id;
      }
    } catch (e) {
      log.warn(`[WhatsApp] Could not read creds.json: ${e.message}`);
    }

    if (hasValidSession) {
      if (whatsAppClient.wasManuallyDisconnected()) {
        log.info('[WhatsApp] Saved session found but user manually disconnected — skipping auto-connect');
        return;
      }
      log.info('[WhatsApp] Saved session found — auto-connecting...');
      whatsAppClient.setMainWindow(mainWindow);
      setTimeout(() => {
        whatsAppClient.initialize().catch(err => {
          log.error('[WhatsApp] Auto-connect failed:', err.message);
        });
      }, 4000);
    } else {
      log.info('[WhatsApp] No saved session — skipping auto-connect');
    }
  });

  // Register keyboard shortcuts (since menu is removed)
  if (isDev) {
    // Reload page
    globalShortcut.register('CommandOrControl+R', () => {
      if (mainWindow) mainWindow.webContents.reload();
    });

    // Force reload (ignore cache)
    globalShortcut.register('CommandOrControl+Shift+R', () => {
      if (mainWindow) mainWindow.webContents.reloadIgnoringCache();
    });

    // Toggle DevTools
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      if (mainWindow) mainWindow.webContents.toggleDevTools();
    });

    // Also F12 for DevTools
    globalShortcut.register('F12', () => {
      if (mainWindow) mainWindow.webContents.toggleDevTools();
    });

    // F5 for reload
    globalShortcut.register('F5', () => {
      if (mainWindow) mainWindow.webContents.reload();
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// STARTUP SNAPSHOT: Copy the LevelDB directory BEFORE creating the BrowserWindow.
// Chromium opens (and may compact) the LevelDB when the window first loads a URL.
// By snapshotting first, we preserve the previous session's raw .log file
// (uncompressed write-ahead log) which contains the most recently written data.
// The recovery tool reads this snapshot instead of the live, possibly-compacted DB.
// ─────────────────────────────────────────────────────────────────────────────
function snapshotLevelDB() {
  try {
    const leveldbPath = path.join(app.getPath('userData'), 'Local Storage', 'leveldb');
    const snapshotPath = path.join(app.getPath('userData'), 'bizpos-recovery-snapshot');

    if (!fs.existsSync(leveldbPath)) return;

    // Remove old snapshot first
    try { fs.rmSync(snapshotPath, { recursive: true }); } catch (_) {}
    fs.mkdirSync(snapshotPath, { recursive: true });

    for (const file of fs.readdirSync(leveldbPath)) {
      if (file === 'LOCK') continue; // skip exclusive lock file
      try {
        fs.copyFileSync(path.join(leveldbPath, file), path.join(snapshotPath, file));
      } catch (_) {} // skip any file we can't copy
    }

    log.info('[BizPOS] LevelDB recovery snapshot saved');
  } catch (err) {
    log.warn('[BizPOS] LevelDB snapshot failed:', err.message);
  }
}

app.whenReady().then(() => {
  // CRITICAL: snapshot BEFORE createWindow() so Chromium doesn't compact/lock the DB
  snapshotLevelDB();

  createWindow();

  // Register all handlers
  registerPrinterHandlers(ipcMain);
  registerCustomerHandlers(ipcMain);
  registerReceiptPrinter(ipcMain);
  registerUSBPrinter(ipcMain);
  registerUSBDetectionHandlers(ipcMain);
  registerWhatsAppHandlers(ipcMain, () => mainWindow);
  registerAssetHandlers(ipcMain);
  registerBackupHandlers(ipcMain);
  registerImageHandlers(ipcMain);
  registerMobilePrintServer();
  registerPRAHandlers(ipcMain);

  // File picker for campaign media
  ipcMain.handle('dialog:pick-file', async (_event, options = {}) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: options.filters || [
        { name: 'Media', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'pdf'] }
      ]
    });
    if (result.canceled || !result.filePaths.length) return null;
    const filePath = result.filePaths[0];
    const name = require('path').basename(filePath);
    const ext = name.split('.').pop().toLowerCase();
    const type = ['jpg','jpeg','png','gif','webp'].includes(ext) ? 'image'
      : ['mp4','mov'].includes(ext) ? 'video'
      : ext === 'pdf' ? 'pdf' : 'other';
    return { path: filePath, name, type };
  });

  // Auto-update: check once on startup. The renderer's update banner decides
  // what happens next — it auto-downloads only if the user enabled "Automatic
  // Updates" in Settings, otherwise it waits for a "Download" click. The delay
  // lets the renderer mount its update listeners before the check runs.
  if (!isDev && mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch(err => log.error('Startup update check failed:', err));
      }, 8000);
    });
  }

  // Register kitchen token printer - supports both USB and IP
  ipcMain.handle('print-kitchen-token', async (event, { orderData, userProfile, printerConfig }) => {
    try {
      console.log('📨 Kitchen token print request received');
      console.log('🖨️ Printer config:', JSON.stringify(printerConfig, null, 2));

      const usbPort = printerConfig.usb_port || printerConfig.usb_device_path;
      const ipAddress = printerConfig.ip_address || printerConfig.ip;
      const connectionType = printerConfig.connection_type || printerConfig.printer_type;

      // CRITICAL: Determine printer type - check connection_type FIRST
      let printerType;

      // 1. If connection_type explicitly says 'usb', use USB
      if (connectionType === 'usb') {
        printerType = 'usb';
      }
      // 2. If connection_type explicitly says 'ethernet' or 'ip', use IP
      else if (connectionType === 'ethernet' || connectionType === 'ip') {
        printerType = 'ip';
      }
      // 3. Fall back to checking available data - USB path takes priority
      else if (usbPort && usbPort.trim() !== '') {
        printerType = 'usb';
      } else if (ipAddress && ipAddress.trim() !== '') {
        printerType = 'ip';
      } else {
        throw new Error('No USB port or IP address configured for printer');
      }

      console.log('🖨️ Connection type from config:', connectionType || 'N/A');
      console.log('🖨️ Detected printer type:', printerType);
      console.log('🖨️ USB Port:', usbPort || 'N/A');
      console.log('🖨️ IP Address:', ipAddress || 'N/A');

      if (printerType === 'usb') {
        if (!usbPort || usbPort.trim() === '') {
          throw new Error('USB printer selected but no USB port configured');
        }
        console.log('🖨️ Routing to USB printer:', usbPort);
        const { printKitchenTokenToUSB } = require('./printing/usbPrinter');
        await printKitchenTokenToUSB(usbPort, orderData, userProfile);
        return { success: true };
      } else {
        if (!ipAddress || ipAddress.trim() === '') {
          throw new Error('IP printer selected but no IP address configured');
        }
        console.log('🖨️ Routing to IP printer:', ipAddress);
        const port = parseInt(printerConfig.port || '9100');
        await printKitchenToken(ipAddress, port, orderData, userProfile);
        return { success: true };
      }
    } catch (error) {
      console.error('❌ Kitchen token print error:', error);
      return { success: false, error: error.message };
    }
  });
});


// ═══ Fingerprint engine via dpfj.dll (DigitalPersona FingerJet) ══════════════
// Pipeline (per the authoritative U.are.U SDK dpfj.h):
//   1. DpHost WebSDK captures a finger as a SampleFormat.Intermediate IMAGE
//      (base64). It is an image, NOT a template.
//   2. dpfj_create_fmd_from_fid(...) extracts that image into an FMD
//      (Fingerprint Minutiae Data) — a pre-reg / verification feature set.
//   3. Enroll: combine N pre-reg FMDs (start/add/create/finish enrollment)
//      into ONE registration template (stored in DB).
//   4. Verify: dpfj_compare(regTemplate, liveVerFmd) → dissimilarity score.
//      Lower score = better match. matched = score <= threshold.
//
// FMD format constants (dpfj.h):  PRE_REG=0, REG=1 (template), VER=2.
// The exact FID/image format that the WebSDK "Intermediate" sample decodes
// to is undocumented, so createFmd() PROBES a list of candidate input
// formats and logs which one returns DPFJ_SUCCESS — we lock that in once the
// first real-hardware run reveals it.
const DPFJ = {
  FMD_ANSI_378:  0x001B0001,
  FMD_ISO_19794: 0x01010001,
  FMD_PRE_REG:   0,   // pre-enrollment feature set
  FMD_REG:       1,   // enrollment template (what we store)
  FMD_VER:       2,   // verification feature set
  // FID (image) input formats — candidates for the Intermediate sample
  FID_ANSI_381:    0x001B0401,
  FID_ISO_19794_4: 0x01010007,
  SUCCESS: 0,
  E_MORE_DATA: 0x05BA000D, // DPERROR(0x0d) — "accepted, add more" during enrollment
}

// dpfj_compare dissimilarity score is in [0, 0x7fffffff]; FAR ≈ score/0x7fffffff.
// Default threshold targets FAR ≈ 1e-5 (1 in 100,000). Lower = stricter.
const DPFJ_PROBABILITY_ONE = 0x7fffffff
const DEFAULT_MATCH_THRESHOLD = Math.floor(DPFJ_PROBABILITY_ONE / 100000) // ≈ 21474
const FMD_BUF = 8192 // generous; a single-view FMD is well under this

let _fp = null
function getFp() {
  if (_fp) return _fp
  try {
    const koffi = require('koffi')
    const lib = koffi.load('dpfj.dll')
    const fns = { koffi, available: {} }
    const bind = (name, ret, args) => {
      try { fns[name] = lib.func(name, ret, args); fns.available[name] = true }
      catch (e) { fns.available[name] = false; log.warn(`[FP] symbol missing: ${name} (${e.message})`) }
    }
    // image (FID) → FMD
    bind('dpfj_create_fmd_from_fid', 'int', [
      'uint32', 'void *', 'uint32', 'uint32', 'void *', koffi.inout(koffi.pointer('uint32')),
    ])
    // raw bitmap → FMD (fallback path if we ever capture Raw)
    bind('dpfj_create_fmd_from_raw', 'int', [
      'void *', 'uint32', 'uint32', 'uint32', 'uint32', 'uint32', 'uint32',
      'uint32', 'void *', koffi.inout(koffi.pointer('uint32')),
    ])
    // legacy single-entry extractor present in older dpfj.dll builds
    bind('dpfj_create_fmd', 'int', [
      'uint32', 'void *', 'uint32', 'uint32', 'void *', koffi.inout(koffi.pointer('uint32')),
    ])
    // enrollment session (combine pre-reg FMDs → one template)
    bind('dpfj_start_enrollment', 'int', ['uint32'])
    bind('dpfj_add_to_enrollment', 'int', ['uint32', 'void *', 'uint32', 'uint32'])
    bind('dpfj_create_enrollment_fmd', 'int', ['void *', koffi.inout(koffi.pointer('uint32'))])
    bind('dpfj_finish_enrollment', 'int', [])
    // 1:1 compare (single view vs single view)
    bind('dpfj_compare', 'int', [
      'uint32', 'void *', 'uint32', 'uint32',
      'uint32', 'void *', 'uint32', 'uint32',
      koffi.out(koffi.pointer('uint32')),
    ])
    // 1:N identify — matches a probe feature set against enrollment templates.
    // fmds is an array of pointers; candidates is a DPFJ_CANDIDATE[] out buffer
    // ({uint32 size; uint32 fmd_idx; uint32 view_idx} = 12 bytes each).
    bind('dpfj_identify', 'int', [
      'uint32', 'void *', 'uint32', 'uint32',         // probe: type, fmd, size, view
      'uint32', 'uint32', 'void **', 'uint32 *',      // templates: type, cnt, fmds**, sizes*
      'uint32', koffi.inout(koffi.pointer('uint32')), // threshold, candidate_cnt (in:capacity/out:found)
      'void *',                                       // candidates out buffer
    ])
    _fp = fns
    log.info('[FP] dpfj.dll loaded — symbols:', JSON.stringify(fns.available))
    return _fp
  } catch (err) {
    log.error('[FP] dpfj.dll load failed:', err.message)
    return null
  }
}

// IMPORTANT: the WebSDK SampleFormat.Intermediate sample is NOT an image — it
// arrives as a ~330-byte DigitalPersona feature set (an FMD) already extracted
// by DpHost. So we do NOT run a feature extractor (dpfj_create_fmd_*) on it;
// we feed the raw sample bytes straight into enrollment / compare as an FMD.
const hex = (n) => '0x' + ((n >>> 0).toString(16))

// The DP feature-set type of a captured sample is not advertised, and the
// stored template's type depends on how it was built. dpfj_compare only needs
// the (fmd1_type, fmd2_type) pair to be right, so we probe candidate pairs once
// and cache the winner. Lead with REG-template × VER-sample (the normal case).
const TYPE_LABEL = { 0: 'PRE_REG', 1: 'REG', 2: 'VER', [DPFJ.FMD_ANSI_378]: 'ANSI378', [DPFJ.FMD_ISO_19794]: 'ISO19794' }
// CRITICAL: only the small enum types {REG=1, VER=2} are safe with this
// dpfj.dll. PRE_REG(0) → INVALID_PARAMETER for compare; ANSI378 → INVALID_FMD;
// ISO19794 (and other big-hex types) cause an ACCESS VIOLATION that crashes the
// whole process. Never pass ISO/ANSI to compare or enrollment. The canonical
// match is a REG template vs a VER feature set, so [REG,VER] leads.
const COMPARE_PAIRS = [
  [DPFJ.FMD_REG, DPFJ.FMD_VER], [DPFJ.FMD_VER, DPFJ.FMD_REG],
  [DPFJ.FMD_REG, DPFJ.FMD_REG], [DPFJ.FMD_VER, DPFJ.FMD_VER],
]
let _cmpPair = null

// Compare a stored template against a live feature set. Probes type pairs until
// dpfj_compare returns SUCCESS, then caches the working pair. Returns
// { ok, score, pair, status } — score is dissimilarity (lower = better).
function compareFmd(f, storedBuf, liveBuf) {
  const run = (t1, t2) => {
    const score = [0]
    const status = f.dpfj_compare(t1, storedBuf, storedBuf.length, 0, t2, liveBuf, liveBuf.length, 0, score)
    return { status, score: score[0] }
  }
  if (_cmpPair) {
    const r = run(_cmpPair[0], _cmpPair[1])
    if (r.status === DPFJ.SUCCESS) return { ok: true, score: r.score, pair: _cmpPair, status: r.status }
  }
  let lastStatus = -1
  for (const [t1, t2] of COMPARE_PAIRS) {
    if (_cmpPair && t1 === _cmpPair[0] && t2 === _cmpPair[1]) continue
    const r = run(t1, t2)
    lastStatus = r.status
    if (r.status === DPFJ.SUCCESS) {
      _cmpPair = [t1, t2]
      log.info(`[FP] compare pair locked → ${TYPE_LABEL[t1]}×${TYPE_LABEL[t2]}`)
      return { ok: true, score: r.score, pair: _cmpPair, status: r.status }
    }
    log.info(`[FP] compare ${TYPE_LABEL[t1]}×${TYPE_LABEL[t2]} → status=${hex(r.status)}`)
  }
  return { ok: false, status: lastStatus }
}

// ── Stateful enrollment session ───────────────────────────────────────────────
// The canonical DigitalPersona flow: dpfj_start_enrollment(REG) once, then
// dpfj_add_to_enrollment(PRE_REG, …) for each captured feature set. The engine
// returns DPFJ_E_MORE_DATA ("keep going") until it has enough, then SUCCESS —
// only THEN do we dpfj_create_enrollment_fmd(). Samples are fed one per IPC call
// as the user lifts and re-places the finger. Types stay in {REG, PRE_REG} only.
let _enroll = { active: false, count: 0 }

ipcMain.handle('fingerprint:enrollStart', async () => {
  const f = getFp()
  if (!f) return { ok: false, error: 'dpfj.dll not available — install DigitalPersona U.are.U runtime' }
  if (!f.available.dpfj_start_enrollment) return { ok: false, error: 'enrollment not supported by dpfj.dll' }
  try { if (_enroll.active) { try { f.dpfj_finish_enrollment() } catch {} } } catch {}
  const startStatus = f.dpfj_start_enrollment(DPFJ.FMD_REG) // output template = REG
  if (startStatus !== DPFJ.SUCCESS) { _enroll = { active: false, count: 0 }; return { ok: false, error: `start_enrollment → ${hex(startStatus)}` } }
  _enroll = { active: true, count: 0 }
  log.info('[FP] enrollStart OK (REG output)')
  return { ok: true }
})

// Add one captured feature set. Returns:
//   { ok:true, done:true, template }  — enrollment complete, REG template ready
//   { ok:true, done:false, count }    — accepted, need more captures
//   { ok:true, rejected:true, count } — bad/dup capture, ask the user to retry
//   { ok:false, error }               — fatal; session is closed
ipcMain.handle('fingerprint:enrollAdd', async (_event, sampleB64) => {
  const f = getFp()
  if (!f) return { ok: false, error: 'dpfj.dll not available' }
  if (!_enroll.active) return { ok: false, error: 'enrollment not started' }
  const buf = Buffer.from(sampleB64 || '', 'base64')
  if (buf.length < 100 || buf.length > 4096) return { ok: true, rejected: true, count: _enroll.count, reason: 'bad capture size' }
  try {
    const st = f.dpfj_add_to_enrollment(DPFJ.FMD_PRE_REG, buf, buf.length, 0)
    log.info(`[FP] add_to_enrollment → ${hex(st)} (count was ${_enroll.count})`)

    if (st === DPFJ.E_MORE_DATA) { _enroll.count++; return { ok: true, done: false, count: _enroll.count } }

    if (st === DPFJ.SUCCESS) {
      _enroll.count++
      // Engine is satisfied → build the registration template.
      let out = Buffer.alloc(FMD_BUF); let sz = [FMD_BUF]
      let createStatus = f.dpfj_create_enrollment_fmd(out, sz)
      if (createStatus === DPFJ.E_MORE_DATA && sz[0] > 0 && sz[0] <= 65536) { // buffer too small — resize once
        out = Buffer.alloc(sz[0]); sz = [out.length]
        createStatus = f.dpfj_create_enrollment_fmd(out, sz)
      }
      try { f.dpfj_finish_enrollment() } catch {}
      _enroll = { active: false, count: 0 }
      log.info(`[FP] create_enrollment_fmd → ${hex(createStatus)} size=${sz[0]}`)
      if (createStatus === DPFJ.SUCCESS && sz[0] > 0) {
        const template = JSON.stringify({ v: 2, kind: 'reg', t: out.subarray(0, sz[0]).toString('base64') })
        return { ok: true, done: true, template, templateBytes: sz[0] }
      }
      return { ok: false, error: `create_enrollment_fmd → ${hex(createStatus)}` }
    }

    // Any other code (e.g. INVALID_FMD on a smudged scan) → ask user to retry,
    // keep the session open so prior good captures aren't lost.
    return { ok: true, rejected: true, count: _enroll.count, reason: hex(st) }
  } catch (err) {
    try { f.dpfj_finish_enrollment() } catch {}
    _enroll = { active: false, count: 0 }
    log.error('[FP] enrollAdd error:', err.message)
    return { ok: false, error: err.message }
  }
})

ipcMain.handle('fingerprint:enrollCancel', async () => {
  const f = getFp()
  try { if (f && _enroll.active) f.dpfj_finish_enrollment() } catch {}
  _enroll = { active: false, count: 0 }
  return { ok: true }
})

// A stored template is JSON: { v:2, kind:'reg', t:b64 } (a REG template) or
// { v:1, samples:[b64,...] } (raw feature sets). Legacy = a bare base64 string.
// Return the list of comparable FMD buffers.
function templateBufs(templateStr) {
  try {
    const o = JSON.parse(templateStr)
    if (o && o.v === 2 && o.kind === 'reg' && o.t) return [Buffer.from(o.t, 'base64')]
    if (o && o.v === 1 && Array.isArray(o.samples)) return o.samples.map(s => Buffer.from(s, 'base64'))
  } catch { /* not JSON → legacy single base64 template */ }
  return [Buffer.from(templateStr, 'base64')]
}

// Best (lowest) score of a live feature set vs all of a template's stored
// feature sets, via dpfj_compare (legacy single-view fallback only).
function compareTemplate(f, templateStr, liveBuf) {
  let best = null, lastStatus = -1
  for (const stored of templateBufs(templateStr)) {
    const r = compareFmd(f, stored, liveBuf)
    if (!r.ok) { lastStatus = r.status; continue }
    if (!best || r.score < best.score) best = r
  }
  return best ? { ok: true, ...best } : { ok: false, status: lastStatus }
}

// Return the REG template buffer for a v2 template, else null.
function regTemplateBuf(templateStr) {
  try { const o = JSON.parse(templateStr); if (o && o.v === 2 && o.kind === 'reg' && o.t) return Buffer.from(o.t, 'base64') } catch {}
  return null
}

// 1:N (and 1:1) match via dpfj_identify — the correct call for matching a probe
// feature set against multi-view REG enrollment templates. `regBufs` are REG
// template buffers; returns { ok, matchedIdx } where matchedIdx is the index of
// the matching template (or -1 if none under threshold).
const CANDIDATE_SIZE = 12 // DPFJ_CANDIDATE { uint32 size, fmd_idx, view_idx }
function identifyAgainst(f, liveBuf, regBufs, threshold) {
  if (!f.available.dpfj_identify) return { ok: false, error: 'dpfj_identify missing' }
  const cnt = regBufs.length
  if (!cnt) return { ok: false, error: 'no templates' }
  const sizes = regBufs.map(b => b.length)
  const candidates = Buffer.alloc(CANDIDATE_SIZE * cnt)
  for (let i = 0; i < cnt; i++) candidates.writeUInt32LE(CANDIDATE_SIZE, i * CANDIDATE_SIZE) // preset .size
  const candCnt = [cnt] // in: capacity, out: number found
  const status = f.dpfj_identify(
    DPFJ.FMD_VER, liveBuf, liveBuf.length, 0,   // probe = live verification feature set
    DPFJ.FMD_REG, cnt, regBufs, sizes,          // enrollment REG templates
    threshold >>> 0, candCnt, candidates,
  )
  if (status !== DPFJ.SUCCESS) { log.info(`[FP] identify → status=${hex(status)}`); return { ok: false, status } }
  const found = candCnt[0]
  if (found > 0) {
    const idx = candidates.readUInt32LE(4) // candidates[0].fmd_idx
    return { ok: true, matchedIdx: idx, found }
  }
  return { ok: true, matchedIdx: -1, found: 0 }
}

// 1:1 verify a live feature set against one stored template.
ipcMain.handle('fingerprint:compare', async (_event, templateB64, liveB64, threshold) => {
  const f = getFp()
  if (!f) return { matched: false, error: 'dpfj.dll not available' }
  const th = (Number.isFinite(threshold) ? threshold : DEFAULT_MATCH_THRESHOLD) >>> 0
  try {
    const live = Buffer.from(liveB64, 'base64')
    const reg = regTemplateBuf(templateB64)
    if (reg) {
      const r = identifyAgainst(f, live, [reg], th)
      if (!r.ok) return { matched: false, error: `identify failed ${r.status != null ? hex(r.status) : (r.error || '')}` }
      log.info(`[FP] compare(identify) → matched=${r.matchedIdx === 0} threshold=${th}`)
      return { matched: r.matchedIdx === 0, threshold: th }
    }
    // Legacy v1/raw template → single-view compare fallback.
    const r = compareTemplate(f, templateB64, live)
    if (!r.ok) return { matched: false, error: `compare failed ${hex(r.status)}` }
    return { matched: r.score <= th, score: r.score, threshold: th }
  } catch (err) {
    log.error('[FP] compare error:', err.message)
    return { matched: false, error: err.message }
  }
})

// 1:N identify — one dpfj_identify call against all REG templates at once.
// templates = [{ id, name, template }].
ipcMain.handle('fingerprint:identify', async (_event, liveB64, templates, threshold) => {
  const f = getFp()
  if (!f) return { matched: false, error: 'dpfj.dll not available' }
  const th = (Number.isFinite(threshold) ? threshold : DEFAULT_MATCH_THRESHOLD) >>> 0
  try {
    const live = Buffer.from(liveB64, 'base64')
    const regs = [], emps = []
    for (const t of (templates || [])) {
      const reg = t?.template && regTemplateBuf(t.template)
      if (reg) { regs.push(reg); emps.push(t) }
    }
    if (regs.length) {
      const r = identifyAgainst(f, live, regs, th)
      if (!r.ok) return { matched: false, error: `identify failed ${r.status != null ? hex(r.status) : (r.error || '')}` }
      if (r.matchedIdx >= 0 && emps[r.matchedIdx]) {
        const e = emps[r.matchedIdx]
        log.info(`[FP] identify → MATCH ${e.name} (idx ${r.matchedIdx})`)
        return { matched: true, id: e.id, name: e.name, threshold: th }
      }
      log.info('[FP] identify → no match under threshold')
      return { matched: false, threshold: th }
    }
    // Legacy fallback: compare each raw template, take best score.
    let best = null, comparable = 0
    for (const t of (templates || [])) {
      if (!t?.template) continue
      const r = compareTemplate(f, t.template, live)
      if (!r.ok) continue
      comparable++
      if (!best || r.score < best.score) best = { id: t.id, name: t.name, score: r.score }
    }
    if (!comparable) return { matched: false, error: 'no comparable templates' }
    return { matched: best.score <= th, ...best, threshold: th }
  } catch (err) {
    log.error('[FP] identify error:', err.message)
    return { matched: false, error: err.message }
  }
})

// Diagnostics — confirms the DLL loaded and which symbols resolved.
ipcMain.handle('fingerprint:selftest', async () => {
  const f = getFp()
  if (!f) return { ok: false, error: 'dpfj.dll failed to load — is the DigitalPersona U.are.U runtime installed?' }
  return { ok: true, symbols: f.available, defaultThreshold: DEFAULT_MATCH_THRESHOLD }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Before the app exits, cleanly shut down the WhatsApp browser process.
// This prevents orphaned Chrome processes leaving lock files on next launch.
app.on('before-quit', (event) => {
  if (whatsAppClient.client || whatsAppClient._browserPid) {
    event.preventDefault(); // Hold quit until cleanup finishes
    whatsAppClient.forceShutdown()
      .catch(err => log.warn('[Main] WhatsApp shutdown error:', err.message))
      .finally(() => app.exit(0));
  }
});

app.on('will-quit', () => {
  // Unregister all shortcuts when quitting
  globalShortcut.unregisterAll();
});

ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-local-ip', () => {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
});

// Auto-updater IPC handlers
ipcMain.handle('check-for-updates', async () => {
  if (isDev) {
    return { message: 'Updates disabled in development mode' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result.updateInfo };
  } catch (error) {
    log.error('Error checking for updates:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', () => {
  log.info('Installing update and restarting...');
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('download-update', async () => {
  if (isDev) {
    return { message: 'Updates disabled in development mode' };
  }
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    log.error('Error downloading update:', error);
    return { success: false, error: error.message };
  }
});