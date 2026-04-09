/**
 * WhatsApp IPC Handlers
 * Registers all whatsapp-related ipcMain handlers.
 */

const log = require('electron-log');
const whatsAppClient = require('./whatsappClient');
const { formatPhoneForWhatsApp } = require('./phoneFormatter');

function registerWhatsAppHandlers(ipcMain, getMainWindow) {
  // ─── Connection ───────────────────────────────────────────

  ipcMain.handle('whatsapp:connect', async () => {
    try {
      const win = getMainWindow();
      whatsAppClient.setMainWindow(win);
      // If already connected or connecting (e.g. auto-connect on startup), skip re-init
      if (whatsAppClient.status === 'connected' || whatsAppClient.status === 'connecting') {
        log.info('[WA Handler] Already connected/connecting — skipping manual connect');
        return { success: true };
      }
      await whatsAppClient.initialize();
      return { success: true };
    } catch (err) {
      log.error('[WA Handler] connect error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('whatsapp:disconnect', async () => {
    try {
      await whatsAppClient.disconnect();
      return { success: true };
    } catch (err) {
      log.error('[WA Handler] disconnect error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('whatsapp:status', async () => {
    return whatsAppClient.getStatus();
  });

  // ─── Send auto thank-you message on order complete ────────

  ipcMain.handle('whatsapp:send-order-message', async (_event, { phone, message }) => {
    try {
      const formatted = formatPhoneForWhatsApp(phone);
      if (!formatted) {
        return { success: false, error: 'Invalid phone number format', skipped: true, skipReason: 'invalid_phone' };
      }
      await whatsAppClient.sendMessage(formatted, message);
      return { success: true, phoneSent: formatted };
    } catch (err) {
      log.error('[WA Handler] send-order-message error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ─── Campaign send with delay ─────────────────────────────

  ipcMain.handle('whatsapp:send-campaign-message', async (_event, { phone, message, mediaPath }) => {
    try {
      const formatted = formatPhoneForWhatsApp(phone);
      if (!formatted) {
        return { success: false, skipped: true, skipReason: 'invalid_phone' };
      }

      if (mediaPath) {
        await whatsAppClient.sendMedia(formatted, mediaPath, message);
      } else {
        await whatsAppClient.sendMessage(formatted, message);
      }

      return { success: true, phoneSent: formatted };
    } catch (err) {
      log.error('[WA Handler] send-campaign-message error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ─── Check if number exists on WhatsApp ──────────────────

  ipcMain.handle('whatsapp:check-number', async (_event, { phone }) => {
    try {
      const formatted = formatPhoneForWhatsApp(phone);
      if (!formatted || !whatsAppClient.isConnected()) {
        return { exists: false };
      }
      const result = await whatsAppClient.client.isRegisteredUser(`${formatted}@c.us`);
      return { exists: result };
    } catch (err) {
      return { exists: false, error: err.message };
    }
  });

  log.info('[WhatsApp] Handlers registered');
}

module.exports = { registerWhatsAppHandlers };
