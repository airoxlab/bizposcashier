/**
 * Mobile Print Relay Server
 *
 * A lightweight HTTP server listening on 0.0.0.0:3940 (LAN-accessible).
 * The BizPOS mobile app sends print jobs here, and this server relays them
 * to the configured IP printer using the same ESC/POS stack as the desktop.
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { app, BrowserWindow } = require('electron');
const log = require('electron-log');
const { printReceipt } = require('./receiptPrinter');
const { printKitchenToken } = require('./kitchenTokenPrinter');

const MOBILE_PRINT_PORT = 3940;
const PRINTERS_FILE = path.join(app.getPath('userData'), 'printers.json');
const MAPPINGS_FILE = path.join(app.getPath('userData'), 'category_mappings.json');

async function loadPrinters() {
  try {
    const data = await fs.promises.readFile(PRINTERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function loadMappings() {
  try {
    const data = await fs.promises.readFile(MAPPINGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function getDefaultPrinter(printers) {
  return printers.find(p => p.isDefault || p.is_default) || printers[0] || null;
}

/**
 * Groups items by target printer using category/deal mappings.
 * Returns array of { printerConfig, items } — one entry per printer that has items.
 * Broadcast printers receive all items.
 */
function groupItemsByPrinter(items, mappings, printers) {
  const printerById = {};
  printers.forEach(p => { printerById[p.id] = p; });

  const broadcastPrinterIds = mappings.filter(m => m.type === 'broadcast').map(m => m.printer_id);
  const categoryToPrinter = {};
  const dealToPrinter = {};
  mappings.forEach(m => {
    if (m.type === 'category') categoryToPrinter[m.id] = m.printer_id;
    else if (m.type === 'deal') dealToPrinter[m.id] = m.printer_id;
  });

  // Group items by printer id (or 'default')
  const groups = {};
  items.forEach(item => {
    let targetPrinterId = 'default';
    if (item.isDeal && item.deal_id && dealToPrinter[item.deal_id]) {
      targetPrinterId = dealToPrinter[item.deal_id];
    } else if (!item.isDeal && item.category_id && categoryToPrinter[item.category_id]) {
      targetPrinterId = categoryToPrinter[item.category_id];
    }
    if (!groups[targetPrinterId]) groups[targetPrinterId] = [];
    groups[targetPrinterId].push(item);
  });

  const defaultPrinter = getDefaultPrinter(printers);
  const result = [];

  Object.entries(groups).forEach(([printerId, groupItems]) => {
    const config = printerId === 'default' ? defaultPrinter : (printerById[printerId] || defaultPrinter);
    if (config) {
      // Merge with existing group for same printer if already present
      const existing = result.find(r => r.printerConfig.id === config.id);
      if (existing) {
        existing.items.push(...groupItems);
      } else {
        result.push({ printerConfig: config, items: groupItems });
      }
    }
  });

  // Broadcast printers receive all items
  broadcastPrinterIds.forEach(bpId => {
    const config = printerById[bpId];
    if (!config) return;
    const existing = result.find(r => r.printerConfig.id === config.id);
    if (existing) {
      existing.items = items; // replace with full list
    } else {
      result.push({ printerConfig: config, items });
    }
  });

  // If nothing resolved, fall back to single default print
  if (result.length === 0 && defaultPrinter) {
    result.push({ printerConfig: defaultPrinter, items });
  }

  return result;
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

/**
 * Ensures Windows Firewall allows inbound TCP traffic on the print relay port.
 * Silently skips on non-Windows or if the rule already exists.
 */
function ensureFirewallRule() {
  if (process.platform !== 'win32') return;
  const ruleName = 'BizPOS Mobile Print Relay';
  // Add rule — netsh ignores duplicates gracefully
  execFile('netsh', [
    'advfirewall', 'firewall', 'add', 'rule',
    `name=${ruleName}`,
    'dir=in',
    'action=allow',
    'protocol=TCP',
    `localport=${MOBILE_PRINT_PORT}`,
    'profile=any',
    'enable=yes',
  ], { windowsHide: true }, (err, stdout, stderr) => {
    if (err) {
      log.warn('[MobilePrint] Could not add firewall rule (may need admin rights):', stderr || err.message);
    } else {
      log.info('[MobilePrint] Firewall rule ensured for port', MOBILE_PRINT_PORT);
    }
  });
}

function registerMobilePrintServer() {
  ensureFirewallRule();

  const server = http.createServer(async (req, res) => {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    const { method, url } = req;

    // GET /api/ping — connectivity test from mobile
    if (method === 'GET' && url === '/api/ping') {
      sendJson(res, 200, { ok: true, service: 'BizPOS Print Server' });
      return;
    }

    // POST /api/order-notify — mobile notifies desktop of a new/modified order
    if (method === 'POST' && url === '/api/order-notify') {
      try {
        const data = await parseBody(req);
        sendJson(res, 200, { success: true });
        // Forward to all renderer windows so the orders page updates instantly
        BrowserWindow.getAllWindows().forEach(w => {
          try { w.webContents.send('new-order', data); } catch {}
        });
      } catch (error) {
        sendJson(res, 500, { success: false, error: error.message });
      }
      return;
    }

    // POST /api/print/receipt
    if (method === 'POST' && url === '/api/print/receipt') {
      try {
        const { orderData, userProfile, printerConfig } = await parseBody(req);

        let config = printerConfig;
        if (!config) {
          const printers = await loadPrinters();
          config = getDefaultPrinter(printers);
          if (!config) {
            sendJson(res, 404, { success: false, error: 'No printer configured on desktop. Add a printer in BizPOS Settings.' });
            return;
          }
        }

        const ip = config.ip_address || config.ip;
        const port = parseInt(config.port || '9100');

        if (!ip) {
          sendJson(res, 400, { success: false, error: 'Printer has no IP address configured.' });
          return;
        }

        await printReceipt(ip, port, orderData, userProfile);
        log.info('[MobilePrint] Receipt printed for order:', orderData?.order_number || orderData?.orderNumber);
        sendJson(res, 200, { success: true });
      } catch (error) {
        log.error('[MobilePrint] Receipt print error:', error.message);
        sendJson(res, 500, { success: false, error: error.message });
      }
      return;
    }

    // POST /api/print/kitchen
    if (method === 'POST' && url === '/api/print/kitchen') {
      try {
        const { orderData, userProfile, printerConfig } = await parseBody(req);

        const printers = await loadPrinters();
        const mappings = await loadMappings();
        const items = orderData.items || [];

        // If caller specified a printer or no mappings exist, print once to that printer
        if (printerConfig || mappings.length === 0) {
          const config = printerConfig
            || printers.find(p => p.is_kitchen || p.isKitchen)
            || getDefaultPrinter(printers);
          if (!config) {
            sendJson(res, 404, { success: false, error: 'No printer configured on desktop.' });
            return;
          }
          const ip = config.ip_address || config.ip;
          const port = parseInt(config.port || '9100');
          if (!ip) {
            sendJson(res, 400, { success: false, error: 'Printer has no IP address configured.' });
            return;
          }
          await printKitchenToken(ip, port, orderData, userProfile);
          log.info('[MobilePrint] Kitchen token printed for order:', orderData?.order_number || orderData?.orderNumber);
          sendJson(res, 200, { success: true });
          return;
        }

        // Route items to printers using category/deal mappings
        const groups = groupItemsByPrinter(items, mappings, printers);
        if (groups.length === 0) {
          sendJson(res, 404, { success: false, error: 'No printer configured on desktop.' });
          return;
        }

        const errors = [];
        for (const { printerConfig: cfg, items: groupItems } of groups) {
          const ip = cfg.ip_address || cfg.ip;
          const port = parseInt(cfg.port || '9100');
          if (!ip) continue;
          try {
            await printKitchenToken(ip, port, { ...orderData, items: groupItems }, userProfile);
            log.info(`[MobilePrint] Kitchen token sent to "${cfg.name}" (${ip}:${port}) — ${groupItems.length} item(s)`);
          } catch (e) {
            log.error(`[MobilePrint] Kitchen token failed for printer "${cfg.name}":`, e.message);
            errors.push(`${cfg.name}: ${e.message}`);
          }
        }

        if (errors.length > 0 && errors.length === groups.length) {
          sendJson(res, 500, { success: false, error: errors.join('; ') });
        } else {
          sendJson(res, 200, { success: true, printed: groups.length - errors.length, errors: errors.length > 0 ? errors : undefined });
        }
      } catch (error) {
        log.error('[MobilePrint] Kitchen print error:', error.message);
        sendJson(res, 500, { success: false, error: error.message });
      }
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  });

  server.on('error', (err) => {
    log.error('[MobilePrint] Server error:', err.message);
  });

  server.listen(MOBILE_PRINT_PORT, '0.0.0.0', () => {
    log.info(`[MobilePrint] Print relay listening on 0.0.0.0:${MOBILE_PRINT_PORT}`);
  });

  return server;
}

module.exports = { registerMobilePrintServer };
