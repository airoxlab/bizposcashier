/**
 * WhatsApp IPC Handlers
 * Registers all whatsapp-related ipcMain handlers.
 */

const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const log = require('electron-log');
const whatsAppClient = require('./whatsappClient');
const { formatPhoneForWhatsApp } = require('./phoneFormatter');
const { generateReceiptImage, generateBalanceImage } = require('./receiptImageGenerator');

function getConfigPath() {
  return path.join(app.getPath('userData'), 'bizpos-config.json');
}
function readConfig() {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {}
  return {};
}
function writeConfig(cfg) {
  try { fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf8'); }
  catch (e) { log.warn('[WA Handler] Could not write config:', e.message); }
}

// Errors that mean the socket is dead — trigger immediate reconnect
function isConnectionDead(err) {
  const msg = err?.message || '';
  return (
    msg.includes('Connection Closed') ||
    msg.includes('Connection Lost') ||
    msg.includes('Connection Terminated') ||
    msg.includes('not connected') ||
    msg.includes('write EPIPE') ||
    msg.includes('ECONNRESET') ||
    msg.includes('not-authorized') ||
    msg.includes('WhatsApp is not connected')
  );
}

function triggerReconnectOnSendFailure(err) {
  if (!isConnectionDead(err)) return;
  log.warn('[WA Handler] Connection-dead error on send — triggering immediate reconnect');
  whatsAppClient._stopKeepalive();
  whatsAppClient.setStatus('disconnected');
  whatsAppClient.emit('whatsapp:disconnected', { reason: 'send_frame_detached' });
  whatsAppClient.scheduleReconnect();
}

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

  // Called on every login to disconnect WhatsApp only when the restaurant changes
  ipcMain.handle('whatsapp:on-user-login', async (_event, { restaurantId }) => {
    try {
      const cfg = readConfig();
      const lastId = cfg.lastRestaurantId;
      let disconnected = false;

      if (lastId && lastId !== restaurantId) {
        log.info(`[WA Handler] Restaurant changed (${lastId} → ${restaurantId}) — disconnecting WhatsApp`);
        await whatsAppClient.disconnect();
        disconnected = true;
      } else {
        log.info(`[WA Handler] Same restaurant (${restaurantId}) — keeping WhatsApp connected`);
      }

      cfg.lastRestaurantId = restaurantId;
      writeConfig(cfg);
      return { success: true, disconnected };
    } catch (err) {
      log.error('[WA Handler] on-user-login error:', err.message);
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
      triggerReconnectOnSendFailure(err);
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
      triggerReconnectOnSendFailure(err);
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

  // ─── Send receipt image with message ───────────────────────

  ipcMain.handle('whatsapp:send-receipt-image', async (_event, { phone, message, receiptData }) => {
    try {
      log.info('[WA Handler] send-receipt-image called with:', JSON.stringify({
        phone,
        itemsCount: receiptData?.items?.length,
        items: receiptData?.items,
        total: receiptData?.total,
      }));

      const formatted = formatPhoneForWhatsApp(phone);
      if (!formatted) {
        return { success: false, error: 'Invalid phone number format' };
      }

      // Generate receipt image
      const imagePath = await generateReceiptImage(receiptData);
      log.info(`[WA Handler] Receipt image generated: ${imagePath}`);

      // Send image with message as caption
      await whatsAppClient.sendMedia(formatted, imagePath, message);

      // Clean up temp file
      try {
        const fs = require('fs');
        fs.unlinkSync(imagePath);
      } catch (_) {}

      return { success: true, phoneSent: formatted };
    } catch (err) {
      log.error('[WA Handler] send-receipt-image error:', err.message);
      triggerReconnectOnSendFailure(err);
      return { success: false, error: err.message };
    }
  });

  // ─── Send balance statement image (manual/bulk sends) ─────

  ipcMain.handle('whatsapp:send-balance-image', async (_event, { phone, message, balanceData }) => {
    try {
      log.info('[WA Handler] send-balance-image called for:', balanceData?.customerName);

      const formatted = formatPhoneForWhatsApp(phone);
      if (!formatted) {
        return { success: false, error: 'Invalid phone number format' };
      }

      // Generate balance statement image
      const imagePath = await generateBalanceImage(balanceData);
      log.info(`[WA Handler] Balance image generated: ${imagePath}`);

      // Send image with message as caption
      await whatsAppClient.sendMedia(formatted, imagePath, message);

      // Clean up temp file
      try {
        const fs = require('fs');
        fs.unlinkSync(imagePath);
      } catch (_) {}

      return { success: true, phoneSent: formatted };
    } catch (err) {
      log.error('[WA Handler] send-balance-image error:', err.message);
      triggerReconnectOnSendFailure(err);
      return { success: false, error: err.message };
    }
  });

  // ─── Render images WITHOUT sending (centralized sender) ───
  // The WhatsApp socket now lives on the server. These handlers only generate
  // the receipt/balance PNG locally and return it as a base64 data URL so the
  // renderer can upload it to Supabase Storage and enqueue the send.

  ipcMain.handle('whatsapp:render-receipt-image', async (_event, { receiptData }) => {
    try {
      const imagePath = await generateReceiptImage(receiptData);
      const buf = fs.readFileSync(imagePath);
      try { fs.unlinkSync(imagePath); } catch (_) {}
      return { success: true, dataUrl: `data:image/png;base64,${buf.toString('base64')}` };
    } catch (err) {
      log.error('[WA Handler] render-receipt-image error:', err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('whatsapp:render-balance-image', async (_event, { balanceData }) => {
    try {
      const imagePath = await generateBalanceImage(balanceData);
      const buf = fs.readFileSync(imagePath);
      try { fs.unlinkSync(imagePath); } catch (_) {}
      return { success: true, dataUrl: `data:image/png;base64,${buf.toString('base64')}` };
    } catch (err) {
      log.error('[WA Handler] render-balance-image error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // Read an arbitrary local file (e.g. a picked campaign attachment) as base64
  // so the renderer can upload it to Storage.
  ipcMain.handle('whatsapp:read-file-base64', async (_event, { path: filePath }) => {
    try {
      const buf = fs.readFileSync(filePath);
      return { success: true, base64: buf.toString('base64') };
    } catch (err) {
      log.error('[WA Handler] read-file-base64 error:', err.message);
      return { success: false, error: err.message };
    }
  });

  log.info('[WhatsApp] Handlers registered');
}

module.exports = { registerWhatsAppHandlers };