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


// ─── Fingerprint comparison via dpfj.dll (DigitalPersona) ────────────────────
// Raw intermediate data from DpHost WebSocket cannot be fed to dpfj_compare
// directly — it must first be converted to a DPFJ FMD struct via dpfj_create_fmd.
// DPFJ_FMD struct layout: { uint32 cbEffective; uint8 data[cbEffective-4]; }
let _fingerFuncs = null

function getFingerFunctions() {
  if (_fingerFuncs) return _fingerFuncs
  try {
    const koffi = require('koffi')
    const lib = koffi.load('dpfj.dll')
    _fingerFuncs = {
      koffi,
      // Convert raw captured intermediate data → proper DPFJ FMD struct
      createFmd: lib.func('dpfj_create_fmd', 'int', [
        'uint32',                           // DPFPDD image format
        'void *',                           // input buffer
        'uint32',                           // input size
        'uint32',                           // desired FMD format
        koffi.out(koffi.pointer('void *')), // ppFMD [out] — allocated by callee
      ]),
      freeFmd: lib.func('dpfj_free_fmd', 'int', ['void *']),
      compare: lib.func('dpfj_compare', 'int', [
        'uint32', 'void *', 'uint32',
        'uint32', 'void *', 'uint32',
        'uint32',
        koffi.out(koffi.pointer('uint32')), // achieved_far [out]
        koffi.out(koffi.pointer('int32')),  // result [out] — 0=no match, >0=match
      ]),
    }
    log.info('[Fingerprint] dpfj.dll loaded')
    return _fingerFuncs
  } catch (err) {
    log.error('[Fingerprint] dpfj.dll load failed:', err.message)
    return null
  }
}

// Convert one intermediate buffer → DPFJ FMD pointer.
// DpHost's SampleFormat.Intermediate = 2, but DPFPDD_IMG_FMT_INTERMEDIATE = 1.
// Try 1 first (native value), fall back to 2 (DpHost protocol value) if rejected.
function createFmdFromBuf(f, buf) {
  const DPFJ_FMD_DP_PRE_REG_FEATURES = 0x00270000
  const fmdPtr = [null]
  for (const fmt of [1, 2]) {
    const s = f.createFmd(fmt, buf, buf.length, DPFJ_FMD_DP_PRE_REG_FEATURES, fmdPtr)
    if (s === 0) return { fmdPtr, fmtUsed: fmt }
    log.info(`[Fingerprint] create_fmd(fmt=${fmt}) → 0x${s.toString(16)}`)
  }
  return null
}

ipcMain.handle('fingerprint:compare', async (_event, storedB64, liveB64) => {
  const f = getFingerFunctions()
  if (!f) return { matched: false, error: 'dpfj.dll not available — install DigitalPersona drivers' }

  const DPFJ_FMD_DP_PRE_REG_FEATURES = 0x00270000
  const buf1 = Buffer.from(storedB64, 'base64')
  const buf2 = Buffer.from(liveB64, 'base64')

  const r1 = createFmdFromBuf(f, buf1)
  const r2 = createFmdFromBuf(f, buf2)

  try {
    if (!r1) return { matched: false, error: 'create_fmd failed for stored template' }
    if (!r2) return { matched: false, error: 'create_fmd failed for live sample' }

    // Read cbEffective (first uint32) to get total FMD struct size
    const fmd1Size = f.koffi.decode(r1.fmdPtr[0], 'uint32')
    const fmd2Size = f.koffi.decode(r2.fmdPtr[0], 'uint32')
    log.info(`[Fingerprint] FMD sizes: stored=${fmd1Size} live=${fmd2Size}`)

    const achievedFar = [0]
    const result = [0]
    const status = f.compare(
      DPFJ_FMD_DP_PRE_REG_FEATURES, r1.fmdPtr[0], fmd1Size,
      DPFJ_FMD_DP_PRE_REG_FEATURES, r2.fmdPtr[0], fmd2Size,
      0, achievedFar, result
    )

    log.info(`[Fingerprint] compare: status=0x${status.toString(16)} result=${result[0]} far=${achievedFar[0]}`)
    return { matched: status === 0 && result[0] > 0, status, far: achievedFar[0] }
  } catch (err) {
    log.error('[Fingerprint] compare error:', err.message)
    return { matched: false, error: err.message }
  } finally {
    try { if (r1?.fmdPtr[0]) f.freeFmd(r1.fmdPtr[0]) } catch {}
    try { if (r2?.fmdPtr[0]) f.freeFmd(r2.fmdPtr[0]) } catch {}
  }
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