/**
 * WhatsApp Client Manager (whatsapp-web.js)
 * Handles connection, session persistence, and auto-reconnect.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { app } = require('electron');
const log = require('electron-log');

// ─── Utility functions ──────────────────────────────────────────────────────

function findChrome() {
  const local = process.env.LOCALAPPDATA || '';
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(local, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(local, 'Google\\Chrome Beta\\Application\\chrome.exe'),
    path.join(local, 'Google\\Chrome SxS\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(local, 'Microsoft\\Edge\\Application\\msedge.exe'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      log.info(`[WhatsApp] Using browser: ${p}`);
      return p;
    }
  }
  log.warn('[WhatsApp] No system Chrome/Edge found — puppeteer will use its cache');
  return null;
}

/**
 * Use WMIC to find chrome.exe / msedge.exe processes whose command line
 * contains the given session directory, then force-kill each one.
 * Only called at startup to clean up orphaned processes from a previous crash.
 *
 * NOTE: WMIC on Windows uses \r\r\n line endings (not \r\n). We must strip
 * all \r before parsing, otherwise multiple entries merge into one block and
 * the wrong PID (e.g. the user's real Chrome) gets killed.
 */
async function killChromeForSession(sessionDir) {
  if (process.platform !== 'win32') return;
  log.info('[WhatsApp] Scanning for orphaned browser processes via wmic...');
  try {
    const raw = execSync(
      'wmic process where "name=\'chrome.exe\' or name=\'msedge.exe\'" get ProcessId,CommandLine /value',
      { stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 }
    ).toString('utf8');

    const normalizedDir = sessionDir.toLowerCase();
    let killed = 0;

    // Strip \r so that \r\r\n becomes \n — fixes WMIC's non-standard line endings
    const lines = raw.replace(/\r/g, '').split('\n');
    let currentCmd = '';
    let currentPid = null;

    const tryKill = () => {
      if (currentPid && currentCmd.includes(normalizedDir)) {
        log.info(`[WhatsApp] Killing orphaned browser PID ${currentPid} (found via wmic)`);
        try { execSync(`taskkill /F /T /PID ${currentPid}`, { stdio: 'ignore' }); killed++; } catch {}
      }
      currentCmd = '';
      currentPid = null;
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        tryKill();
      } else if (trimmed.toLowerCase().startsWith('commandline=')) {
        currentCmd = trimmed.slice('commandline='.length).toLowerCase();
      } else if (trimmed.toLowerCase().startsWith('processid=')) {
        currentPid = parseInt(trimmed.slice('processid='.length), 10) || null;
      }
    }
    tryKill(); // handle last entry if no trailing blank line

    if (killed > 0) {
      log.info(`[WhatsApp] Killed ${killed} orphaned browser process(es) — waiting for OS...`);
      await new Promise(r => setTimeout(r, 2000));
    } else {
      log.info('[WhatsApp] No orphaned browser processes found');
    }
  } catch (e) {
    log.warn(`[WhatsApp] wmic scan error (ignored): ${e.message}`);
  }
}

function killTree(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve();
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
      } else {
        execSync(`kill -9 -${pid}`, { stdio: 'ignore' });
      }
      log.info(`[WhatsApp] Killed browser tree PID ${pid}`);
    } catch (e) {
      log.warn(`[WhatsApp] killTree(${pid}) error (ignored): ${e.message}`);
    }
    resolve();
  });
}

function cleanLockFiles(sessionDir) {
  for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'DevToolsActivePort', 'lockfile']) {
    const p = path.join(sessionDir, name);
    try { if (fs.existsSync(p)) { fs.unlinkSync(p); log.info(`[WhatsApp] Removed lock file: ${name}`); } } catch {}
  }
}

// ─── Persisted config ───────────────────────────────────────────────────────

function getConfigPath() {
  return path.join(app.getPath('userData'), 'bizpos-config.json');
}
function readConfig() {
  try { return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')); } catch { return {}; }
}
function writeConfig(key, value) {
  try {
    const cfg = readConfig();
    cfg[key] = value;
    fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) { log.warn(`[WhatsApp] Could not write config: ${e.message}`); }
}

// ─────────────────────────────────────────────────────────────────────────────

class WhatsAppClientManager {
  constructor() {
    this.client = null;
    this.status = 'disconnected';
    this.qrCode = null;
    this.mainWindow = null;
    this.reconnectTimer = null;
    this._manualDisconnect = false;
    this._browserPid = null;
    /** Active initialization promise — prevents concurrent initialize() calls */
    this._initPromise = null;
  }

  setMainWindow(win) { this.mainWindow = win; }

  emit(event, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(event, data);
    }
  }

  getStatus() { return { status: this.status, qrCode: this.qrCode }; }

  _getSessionDir() {
    return path.join(app.getPath('userData'), 'whatsapp-session', 'session');
  }

  wasManuallyDisconnected() {
    return readConfig().whatsappManualDisconnect === true;
  }

  // ────────────────────────────────────────────────────────────────────────
  // PUBLIC: initialize()
  // Safe to call from anywhere — auto-connect, manual connect, reconnect.
  // If already running, returns the existing promise (no double-launch).
  // If already connected, no-ops.
  // ────────────────────────────────────────────────────────────────────────
  async initialize() {
    // Already connected — nothing to do
    if (this.status === 'connected' && this.client) {
      log.info('[WhatsApp] Already connected — skipping initialize');
      return;
    }

    // Another initialize() is in-flight — piggyback on it instead of destroying
    if (this._initPromise) {
      log.info('[WhatsApp] Initialize already in progress — waiting for existing attempt...');
      return this._initPromise;
    }

    this._initPromise = this._doInitialize();
    try {
      await this._initPromise;
    } finally {
      this._initPromise = null;
    }
  }

  /** Internal — the actual initialization work. Only one instance runs at a time. */
  async _doInitialize() {
    // If a previous client exists (e.g. from a failed attempt), clean it up first
    if (this.client) await this.destroy();

    this._manualDisconnect = false;
    writeConfig('whatsappManualDisconnect', false);
    this.setStatus('connecting');
    log.info('[WhatsApp] Initializing client...');

    const sessionDir = this._getSessionDir();

    // Kill any orphaned Chrome from a previous unclean shutdown
    await killChromeForSession(sessionDir);

    if (this._browserPid) {
      log.info(`[WhatsApp] Killing tracked browser PID ${this._browserPid}...`);
      await killTree(this._browserPid);
      this._browserPid = null;
      await new Promise(r => setTimeout(r, 500));
    }

    cleanLockFiles(sessionDir);

    const sessionPath = path.join(app.getPath('userData'), 'whatsapp-session');
    const chromePath = findChrome();

    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: sessionPath }),
      puppeteer: {
        headless: true,
        ...(chromePath ? { executablePath: chromePath } : {}),
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
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
      this._captureBrowserPid();
      this.qrCode = qr;
      this.setStatus('qr_ready');
      this.emit('whatsapp:qr', { qr });
    });

    this.client.on('ready', () => {
      log.info('[WhatsApp] Client ready');
      this._captureBrowserPid();
      this.qrCode = null;
      this.setStatus('connected');
      this.emit('whatsapp:ready', {});
    });

    this.client.on('authenticated', () => {
      log.info('[WhatsApp] Authenticated');
      this.emit('whatsapp:authenticated', {});
    });

    this.client.on('auth_failure', (msg) => {
      log.error('[WhatsApp] Auth failure:', msg);
      this.setStatus('failed');
      this.emit('whatsapp:error', { message: 'Authentication failed. Please reconnect.' });
    });

    this.client.on('disconnected', (reason) => {
      log.warn('[WhatsApp] Disconnected:', reason);
      this.setStatus('disconnected');
      this.emit('whatsapp:disconnected', { reason });
      this.scheduleReconnect();
    });

    try {
      await this.client.initialize();
    } catch (err) {
      log.error('[WhatsApp] Init error:', err.message);
      this.setStatus('failed');
      this.emit('whatsapp:error', { message: err.message });
      cleanLockFiles(sessionDir);
    }
  }

  _captureBrowserPid() {
    try {
      // whatsapp-web.js: pupBrowser is a property, NOT a method
      const browser = this.client?.pupBrowser || this.client?.browser;
      if (browser && typeof browser.process === 'function') {
        const proc = browser.process();
        if (proc?.pid) {
          this._browserPid = proc.pid;
          log.info(`[WhatsApp] Browser PID captured: ${this._browserPid}`);
        }
      }
    } catch (e) {
      log.warn('[WhatsApp] Could not capture browser PID:', e.message);
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
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  async disconnect() {
    this._manualDisconnect = true;
    writeConfig('whatsappManualDisconnect', true);
    this.cancelReconnect();
    if (this.client) {
      try { await this.client.logout(); } catch (e) {
        log.warn('[WhatsApp] Logout error (ignored):', e.message);
      }
      await this.destroy();
    }
    this.setStatus('disconnected');
  }

  async destroy() {
    // If an initialize is in progress, clear the promise so callers don't hang
    this._initPromise = null;

    const pid = this._browserPid;
    this._browserPid = null;

    if (this.client) {
      try { await this.client.destroy(); } catch (e) {
        log.warn('[WhatsApp] Destroy error (ignored):', e.message);
      }
      this.client = null;
    }

    if (pid) {
      log.info(`[WhatsApp] Force-killing browser tree PID ${pid}...`);
      await killTree(pid);
    }

    await new Promise(r => setTimeout(r, 1500));
    cleanLockFiles(this._getSessionDir());
  }

  async forceShutdown() {
    log.info('[WhatsApp] Force shutdown requested by app quit...');
    this.cancelReconnect();
    this._manualDisconnect = true;
    // Use the tracked browser PID only — never scan all Chrome processes at shutdown,
    // as the wmic scan can accidentally match and kill the user's own Chrome windows.
    await this.destroy();
    log.info('[WhatsApp] Force shutdown complete');
  }

  async sendMessage(phone, message) {
    if (this.status !== 'connected' || !this.client) {
      throw new Error('WhatsApp is not connected');
    }
    const chatId = `${phone}@c.us`;
    await this.client.sendMessage(chatId, message);
    log.info(`[WhatsApp] Message sent to ${phone}`);
  }

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

  isConnected() { return this.status === 'connected'; }
}

const whatsAppClientManager = new WhatsAppClientManager();
module.exports = whatsAppClientManager;
