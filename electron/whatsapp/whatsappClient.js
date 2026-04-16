/**
 * WhatsApp Client Manager (whatsapp-web.js)
 * Handles connection, session persistence, and auto-reconnect.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const log = require('electron-log');

/**
 * Find an installed Chrome/Chromium executable on the system.
 * Tries common Windows installation paths, then falls back to letting
 * puppeteer find it on its own (which may fail if cache is missing).
 */
function findChrome() {
  const candidates = [
    // Chrome stable
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    // Chrome per-user install
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    // Chrome Beta / Canary
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome Beta\\Application\\chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome SxS\\Application\\chrome.exe'),
    // MS Edge (Chromium-based, works with puppeteer)
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
  ];

  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      log.info(`[WhatsApp] Found browser at: ${p}`);
      return p;
    }
  }

  log.warn('[WhatsApp] No system Chrome/Edge found — puppeteer will use its cache');
  return null;
}

class WhatsAppClientManager {
  constructor() {
    this.client = null;
    this.status = 'disconnected'; // disconnected | connecting | qr_ready | connected | failed
    this.qrCode = null;
    this.mainWindow = null;
    this.reconnectTimer = null;
    this.isInitializing = false;
    this._manualDisconnect = false; // true when user intentionally disconnects — suppresses auto-reconnect
  }

  setMainWindow(win) {
    this.mainWindow = win;
  }

  emit(event, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(event, data);
    }
  }

  getStatus() {
    return {
      status: this.status,
      qrCode: this.qrCode,
    };
  }

  async initialize() {
    if (this.isInitializing && !this.client) return; // already starting up with no client yet
    if (this.client || this.isInitializing) await this.destroy();

    this.isInitializing = true;
    this.setStatus('connecting');
    log.info('[WhatsApp] Initializing client...');

    // Clear stale Chrome lock files before launching (prevents "browser already running" error)
    this._cleanupLockFiles();
    this._manualDisconnect = false; // allow auto-reconnect again after a fresh connect

    const sessionPath = path.join(app.getPath('userData'), 'whatsapp-session');

    const chromePath = findChrome();

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: sessionPath,
      }),
      puppeteer: {
        headless: true,
        ...(chromePath ? { executablePath: chromePath } : {}),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      },
    });

    this.client.on('qr', (qr) => {
      log.info('[WhatsApp] QR code received');
      this.qrCode = qr;
      this.setStatus('qr_ready');
      this.emit('whatsapp:qr', { qr });
    });

    this.client.on('ready', () => {
      log.info('[WhatsApp] Client ready');
      this.qrCode = null;
      this.isInitializing = false;
      this.setStatus('connected');
      this.emit('whatsapp:ready', {});
    });

    this.client.on('authenticated', () => {
      log.info('[WhatsApp] Authenticated');
      this.emit('whatsapp:authenticated', {});
    });

    this.client.on('auth_failure', (msg) => {
      log.error('[WhatsApp] Auth failure:', msg);
      this.isInitializing = false;
      this.setStatus('failed');
      this.emit('whatsapp:error', { message: 'Authentication failed. Please reconnect.' });
    });

    this.client.on('disconnected', (reason) => {
      log.warn('[WhatsApp] Disconnected:', reason);
      this.isInitializing = false;
      this.setStatus('disconnected');
      this.emit('whatsapp:disconnected', { reason });
      this.scheduleReconnect();
    });

    try {
      await this.client.initialize();
    } catch (err) {
      log.error('[WhatsApp] Init error:', err.message);
      this.isInitializing = false;
      this.setStatus('failed');
      this.emit('whatsapp:error', { message: err.message });
    }
  }

  setStatus(status) {
    this.status = status;
    this.emit('whatsapp:status', { status });
  }

  scheduleReconnect() {
    if (this._manualDisconnect) {
      log.info('[WhatsApp] Manual disconnect — skipping auto-reconnect');
      return;
    }
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    log.info('[WhatsApp] Scheduling reconnect in 15 seconds...');
    this.reconnectTimer = setTimeout(() => {
      if (this.status !== 'connected' && this.status !== 'connecting') {
        log.info('[WhatsApp] Attempting auto-reconnect...');
        this.initialize();
      }
    }, 15000);
  }

  cancelReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  async disconnect() {
    this._manualDisconnect = true;
    this.cancelReconnect();
    if (this.client) {
      try {
        await this.client.logout();
      } catch (e) {
        log.warn('[WhatsApp] Logout error (ignored):', e.message);
      }
      await this.destroy();
    }
    this.setStatus('disconnected');
  }

  async destroy() {
    this.isInitializing = false;
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (e) {
        log.warn('[WhatsApp] Destroy error (ignored):', e.message);
      }
      this.client = null;
      // Wait for Chrome process to fully exit before next init
      await new Promise(resolve => setTimeout(resolve, 2000));
      this._cleanupLockFiles();
    }
  }

  _cleanupLockFiles() {
    const sessionPath = path.join(app.getPath('userData'), 'whatsapp-session');
    // LocalAuth creates a subfolder named 'session' (default clientId)
    const sessionDir = path.join(sessionPath, 'session');
    const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
    for (const name of lockFiles) {
      const lockFile = path.join(sessionDir, name);
      try {
        if (fs.existsSync(lockFile)) {
          fs.unlinkSync(lockFile);
          log.info(`[WhatsApp] Removed ${name}`);
        }
      } catch (e) {
        log.warn(`[WhatsApp] Could not remove ${name}:`, e.message);
      }
    }
  }

  /**
   * Send a text message. phone must be in international format: '923001234567'
   */
  async sendMessage(phone, message) {
    if (this.status !== 'connected' || !this.client) {
      throw new Error('WhatsApp is not connected');
    }
    const chatId = `${phone}@c.us`;
    await this.client.sendMessage(chatId, message);
    log.info(`[WhatsApp] Message sent to ${phone}`);
  }

  /**
   * Send media (image, video, pdf) with optional caption
   */
  async sendMedia(phone, mediaPath, caption = '') {
    if (this.status !== 'connected' || !this.client) {
      throw new Error('WhatsApp is not connected');
    }
    const { MessageMedia } = require('whatsapp-web.js');
    const media = MessageMedia.fromFilePath(mediaPath);
    const chatId = `${phone}@c.us`;
    await this.client.sendMessage(chatId, media, { caption });
    log.info(`[WhatsApp] Media sent to ${phone}`);
  }

  isConnected() {
    return this.status === 'connected';
  }
}

const whatsAppClientManager = new WhatsAppClientManager();
module.exports = whatsAppClientManager;
