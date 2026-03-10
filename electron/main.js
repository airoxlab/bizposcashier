const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const url = require('url');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

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
log.info('App starting...');

// Import handlers
const { registerPrinterHandlers } = require('./handlers/printerHandlers');
const { registerCustomerHandlers } = require('./handlers/customerHandlers');
const { registerReceiptPrinter } = require('./printing/receiptPrinter');
const { registerUSBPrinter } = require('./printing/usbPrinter');
const { registerUSBDetectionHandlers } = require('./handlers/usbDetection');
const { printKitchenToken } = require('./printing/kitchenTokenPrinter');
const { registerWhatsAppHandlers } = require('./whatsapp/whatsappHandlers');
const { registerMarketingHandlers } = require('./marketing/marketingHandlers');
const { registerAssetHandlers } = require('./handlers/assetHandlers');
const { registerBackupHandlers } = require('./handlers/backupHandler');
const { registerImageHandlers, getImageDir } = require('./handlers/imageHandler');

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
          res.setHeader('Cache-Control', 'public, max-age=86400');
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
        log.warn(`[BizPOS] Fixed port ${FIXED_PORT} is already in use — falling back to random port. WARNING: Offline orders will NOT persist across restarts in this session.`);
        server.listen(0, '127.0.0.1', loadAppFromServer);
      } else {
        log.error('[BizPOS] HTTP server error:', err.message);
      }
    });

    server.listen(FIXED_PORT, '127.0.0.1', loadAppFromServer);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
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
  registerWhatsAppHandlers(ipcMain);
  registerMarketingHandlers(ipcMain);
  registerAssetHandlers(ipcMain);
  registerBackupHandlers(ipcMain);
  registerImageHandlers(ipcMain);

  // Update check is now manual from Settings > Updates page
  // No automatic check on startup to avoid timing issues

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
        const result = await printKitchenToken(ipAddress, port, orderData, userProfile);
        return result;
      }
    } catch (error) {
      console.error('❌ Kitchen token print error:', error);
      return { success: false, error: error.message };
    }
  });
});


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  // Unregister all shortcuts when quitting
  globalShortcut.unregisterAll();
});

ipcMain.handle('get-app-version', () => app.getVersion());

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