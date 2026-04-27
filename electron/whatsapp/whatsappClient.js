/**
 * WhatsApp Client Manager — @whiskeysockets/baileys
 *
 * No Chrome/Puppeteer. Session is saved as JSON files.
 * Cold start: ~3 s. Reconnect from saved session: ~2 s.
 */

const path   = require('path');
const fs     = require('fs');
const { app } = require('electron');
const log    = require('electron-log');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAuthDir() {
  return path.join(app.getPath('userData'), 'whatsapp-baileys-auth');
}

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

/** Silent no-op logger — keeps Baileys internals quiet */
function makeSilentLogger() {
  const noop = () => {};
  const logger = { level: 'silent', trace: noop, debug: noop, info: noop, warn: noop, error: noop, fatal: noop };
  logger.child = () => logger;
  return logger;
}

// ─────────────────────────────────────────────────────────────────────────────

class WhatsAppClientManager {
  constructor() {
    this.sock        = null;
    this.status      = 'disconnected';
    this.qrCode      = null;
    this.mainWindow  = null;
    this.reconnectTimer = null;
    this._manualDisconnect = false;
    this._initPromise = null;
    this._saveCreds   = null;

    /**
     * Compat shim — handlers call whatsAppClient.client.isRegisteredUser(jid)
     * where jid is `phone@c.us`.  We translate to Baileys format.
     */
    this.client = {
      isRegisteredUser: async (jid) => {
        if (!this.sock || this.status !== 'connected') return false;
        try {
          const phone = jid.replace(/@(c\.us|s\.whatsapp\.net)$/, '');
          const [result] = await this.sock.onWhatsApp(`${phone}@s.whatsapp.net`);
          return result?.exists ?? false;
        } catch { return false; }
      },
    };
  }

  // ── Window / event helpers ───────────────────────────────────────────────

  setMainWindow(win) { this.mainWindow = win; }

  emit(event, data) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(event, data);
    }
  }

  setStatus(status) {
    this.status = status;
    this.emit('whatsapp:status', { status });
  }

  getStatus() { return { status: this.status, qrCode: this.qrCode }; }

  isConnected() { return this.status === 'connected'; }

  // ── Public: initialize / disconnect / destroy ────────────────────────────

  async initialize() {
    if (this.status === 'connected' && this.sock) {
      log.info('[WhatsApp] Already connected — skipping initialize');
      return;
    }
    if (this._initPromise) {
      log.info('[WhatsApp] Initialize already in progress — waiting...');
      return this._initPromise;
    }
    this._initPromise = this._doInitialize();
    try {
      await this._initPromise;
    } finally {
      this._initPromise = null;
    }
  }

  async _doInitialize() {
    if (this.sock) await this._closeSocket();

    this._manualDisconnect = false;
    writeConfig('whatsappManualDisconnect', false);
    this.setStatus('connecting');
    log.info('[WhatsApp] Initializing Baileys socket...');

    // Dynamic import — Baileys is ESM; dynamic import() bridges CJS/ESM in Node 20+
    const {
      default: makeWASocket,
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestBaileysVersion,
    } = await import('@whiskeysockets/baileys');
    const { Boom } = await import('@hapi/boom');

    const authDir = getAuthDir();
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    this._saveCreds = saveCreds;

    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
      log.info(`[WhatsApp] Using WA Web version ${version.join('.')}`);
    } catch (e) {
      log.warn(`[WhatsApp] fetchLatestBaileysVersion failed (${e.message}) — using bundled version`);
      version = undefined; // makeWASocket falls back to its bundled version
    }

    const sockOpts = {
      auth: state,
      logger: makeSilentLogger(),
      printQRInTerminal: false,
      browser: ['BizPOS', 'Chrome', '120.0'],
      connectTimeoutMs: 30_000,
      retryRequestDelayMs: 500,
      maxMsgRetryCount: 3,
    };
    if (version) sockOpts.version = version;

    this.sock = makeWASocket(sockOpts);

    // Persist credentials whenever they change
    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        log.info('[WhatsApp] QR code received');
        this.qrCode = qr;
        this.setStatus('qr_ready');
        this.emit('whatsapp:qr', { qr });
      }

      if (connection === 'open') {
        log.info('[WhatsApp] Connected!');
        this.qrCode = null;
        this.setStatus('connected');
        this.emit('whatsapp:ready', {});
        this.emit('whatsapp:authenticated', {});
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error instanceof Boom)
          ? lastDisconnect.error.output?.statusCode
          : 0;
        const loggedOut = statusCode === DisconnectReason.loggedOut;

        log.warn(`[WhatsApp] Connection closed — code=${statusCode} loggedOut=${loggedOut}`);
        this.setStatus('disconnected');
        this.emit('whatsapp:disconnected', { reason: loggedOut ? 'logged_out' : 'connection_closed' });

        if (loggedOut) {
          // User removed this device from their phone — wipe session so next
          // connect shows a fresh QR code
          log.info('[WhatsApp] Logged out from phone — clearing saved session');
          this._clearAuth();
          return;
        }

        if (!this._manualDisconnect) {
          this.scheduleReconnect();
        }
      }
    });
  }

  // ── Reconnect ────────────────────────────────────────────────────────────

  scheduleReconnect(delayMs = 5000) {
    if (this._manualDisconnect) {
      log.info('[WhatsApp] Manual disconnect — skipping auto-reconnect');
      return;
    }
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    log.info(`[WhatsApp] Reconnecting in ${delayMs / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      if (this.status !== 'connected' && this.status !== 'connecting') {
        log.info('[WhatsApp] Auto-reconnecting...');
        this.initialize();
      }
    }, delayMs);
  }

  cancelReconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  // ── User-initiated disconnect (clears session → shows QR on next connect) ─

  async disconnect() {
    this._manualDisconnect = true;
    writeConfig('whatsappManualDisconnect', true);
    this.cancelReconnect();
    if (this.sock) {
      try { await this.sock.logout(); } catch {}
    }
    await this._closeSocket();
    this._clearAuth();
    this.setStatus('disconnected');
  }

  // ── Internal cleanup (keeps session files intact) ────────────────────────

  async _closeSocket() {
    if (!this.sock) return;
    try { this.sock.ev.removeAllListeners(); } catch {}
    try { this.sock.ws?.close(); } catch {}
    this.sock = null;
  }

  async destroy() {
    this._initPromise = null;
    this.cancelReconnect();
    await this._closeSocket();
  }

  async forceShutdown() {
    log.info('[WhatsApp] Force shutdown (app quit)...');
    this._manualDisconnect = true;
    await this.destroy();
    log.info('[WhatsApp] Shutdown complete');
  }

  _clearAuth() {
    const authDir = getAuthDir();
    try {
      if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
        log.info('[WhatsApp] Auth directory cleared');
      }
    } catch (e) {
      log.warn(`[WhatsApp] Could not clear auth dir: ${e.message}`);
    }
  }

  // ── No-op stubs kept for handler compatibility ───────────────────────────
  // (Baileys auto-reconnects via connection.update; no browser keepalive needed)

  _stopKeepalive()  {}
  _startKeepalive() {}

  wasManuallyDisconnected() {
    return readConfig().whatsappManualDisconnect === true;
  }

  // ── Send ─────────────────────────────────────────────────────────────────

  async sendMessage(phone, message) {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }
    const jid = `${phone}@s.whatsapp.net`;
    await this.sock.sendMessage(jid, { text: message });
    log.info(`[WhatsApp] Message sent to ${phone}`);
  }

  async sendMedia(phone, mediaPath, caption = '') {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }
    const jid = `${phone}@s.whatsapp.net`;
    const buffer = fs.readFileSync(mediaPath);
    const ext    = path.extname(mediaPath).toLowerCase();

    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      await this.sock.sendMessage(jid, { image: buffer, caption });
    } else if (['.mp4', '.mov', '.avi'].includes(ext)) {
      await this.sock.sendMessage(jid, { video: buffer, caption });
    } else {
      const mime = ext === '.pdf' ? 'application/pdf' : 'application/octet-stream';
      await this.sock.sendMessage(jid, {
        document: buffer,
        mimetype: mime,
        fileName: path.basename(mediaPath),
        caption,
      });
    }
    log.info(`[WhatsApp] Media sent to ${phone}`);
  }
}

const whatsAppClientManager = new WhatsAppClientManager();
module.exports = whatsAppClientManager;
