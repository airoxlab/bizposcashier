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
const {
  generateReceiptESCPOS,
  generateKitchenTokenESCPOS,
  printReceiptToUSB,
  printKitchenTokenToUSB,
  sendToWindowsPrinter,
} = require('./usbPrinter');
const { ensureAssets } = require('../handlers/onDemandAssetDownload');

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

// printers.json can accumulate printers from MULTIPLE BizPOS accounts that have
// used this PC. A mobile print must only ever go to printers owned by the
// requesting store — otherwise it tries another store's (offline) printer and
// reports a false "some printers failed". Filter by the user_id on the order's
// userProfile; if nothing is tagged for that user, fall back to all (older
// configs saved printers without a user_id).
function filterPrintersForUser(printers, userProfile) {
  const uid = userProfile?.id || userProfile?.user_id;
  if (!uid) return printers;
  const owned = printers.filter(p => p.user_id === uid);
  return owned.length > 0 ? owned : printers;
}

// ========================================
// PRINTER ROUTING — IP and USB
// The mobile relay must reach whatever printer the desktop has configured:
// a network (IP) printer, a Windows USB Printer Class device, or a COM-port
// printer. resolvePrinterType() normalizes the saved config (same logic the
// desktop's checkPrinterConnection uses) and printReceiptToAny/printKitchenToAny
// dispatch to the matching transport.
// ========================================
function resolvePrinterType(config) {
  const usbPort = config.usb_device_path || config.usb_port || '';
  const ipAddress = config.ip_address || config.ip || '';
  let type = config.connection_type || config.printer_type || '';
  // A "WINUSB:" prefix on the port encodes a Windows USB Printer Class device;
  // the part after the prefix is the actual Windows printer name.
  const winFromPort = usbPort && usbPort.startsWith('WINUSB:') ? usbPort.replace(/^WINUSB:/, '') : null;
  const winName = config.usb_printer_name || winFromPort;

  if (type === 'ethernet' || type === 'network') type = 'ip';

  // A Windows USB Printer Class device MUST go through the spooler — never
  // `copy /b` to a COM port. The WINUSB: prefix (or a usb_printer_name) marks
  // it as such, and that overrides a stale `connection_type: 'usb'` which
  // older configs were saved with even for spooler printers.
  if (winFromPort || (type === 'usb' && winName)) {
    type = 'windows_usb';
  } else if (!type || type === 'thermal') {
    if (winName) type = 'windows_usb';
    else if (usbPort) type = 'usb';
    else if (ipAddress) type = 'ip';
  }
  return { type, ipAddress, port: parseInt(config.port || '9100'), usbPort, winName };
}

async function printReceiptToAny(config, orderData, userProfile) {
  const r = resolvePrinterType(config);
  if (r.type === 'ip') {
    if (!r.ipAddress) throw new Error('Network printer has no IP address configured.');
    await printReceipt(r.ipAddress, r.port, orderData, userProfile);
    return;
  }
  if (r.type === 'windows_usb') {
    if (!r.winName) throw new Error('USB printer has no Windows printer name configured.');
    const assets = await ensureAssets(userProfile?.store_logo, userProfile?.qr_code);
    const buffer = await generateReceiptESCPOS(orderData, userProfile, assets);
    await sendToWindowsPrinter(r.winName, buffer);
    return;
  }
  if (r.type === 'usb') {
    if (!r.usbPort) throw new Error('USB printer has no COM port configured.');
    await printReceiptToUSB(r.usbPort, orderData, userProfile);
    return;
  }
  throw new Error('Printer connection type is not set. Re-add the printer in BizPOS Settings.');
}

async function printKitchenToAny(config, orderData, userProfile) {
  const r = resolvePrinterType(config);
  if (r.type === 'ip') {
    if (!r.ipAddress) throw new Error('Network printer has no IP address configured.');
    await printKitchenToken(r.ipAddress, r.port, orderData, userProfile);
    return;
  }
  if (r.type === 'windows_usb') {
    if (!r.winName) throw new Error('USB printer has no Windows printer name configured.');
    const buffer = await generateKitchenTokenESCPOS(orderData, userProfile);
    await sendToWindowsPrinter(r.winName, buffer);
    return;
  }
  if (r.type === 'usb') {
    if (!r.usbPort) throw new Error('USB printer has no COM port configured.');
    await printKitchenTokenToUSB(r.usbPort, orderData, userProfile);
    return;
  }
  throw new Error('Printer connection type is not set. Re-add the printer in BizPOS Settings.');
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

  // Detect whether ANY routing is configured. When it is, unmapped items must
  // NOT fall back to the default printer — only broadcast printers receive
  // items that don't match a specific category/deal mapping.
  const hasAnyRouting =
    broadcastPrinterIds.length > 0 ||
    Object.keys(categoryToPrinter).length > 0 ||
    Object.keys(dealToPrinter).length > 0;

  // Group items by printer id
  const groups = {};
  items.forEach(item => {
    let targetPrinterId = null;
    if (item.isDeal && item.deal_id && dealToPrinter[item.deal_id]) {
      targetPrinterId = dealToPrinter[item.deal_id];
    } else if (!item.isDeal && item.category_id && categoryToPrinter[item.category_id]) {
      targetPrinterId = categoryToPrinter[item.category_id];
    } else if (!hasAnyRouting) {
      // No routing configured at all — fall back to default printer
      targetPrinterId = 'default';
    }
    if (!targetPrinterId) return; // orphaned — broadcast printers may still receive it
    if (!groups[targetPrinterId]) groups[targetPrinterId] = [];
    groups[targetPrinterId].push(item);
  });

  const defaultPrinter = getDefaultPrinter(printers);
  const result = [];

  Object.entries(groups).forEach(([printerId, groupItems]) => {
    // When routing is configured, unknown printer_id means stale mapping — skip.
    const config = printerId === 'default'
      ? defaultPrinter
      : (printerById[printerId] || (hasAnyRouting ? null : defaultPrinter));
    if (!config) return;
    const existing = result.find(r => r.printerConfig.id === config.id);
    if (existing) {
      existing.items.push(...groupItems);
    } else {
      result.push({ printerConfig: config, items: groupItems });
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

  // Fall back to default ONLY if there's truly zero routing configured.
  // When routing IS configured but matched no printers, respect the config.
  if (result.length === 0 && !hasAnyRouting && defaultPrinter) {
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

    // POST /api/print/test — prints a small confirmation receipt so staff can
    // verify the printer works end-to-end from the mobile app.
    if (method === 'POST' && url === '/api/print/test') {
      try {
        const body = await parseBody(req).catch(() => ({}));
        let config = body.printerConfig;
        if (!config) {
          const printers = filterPrintersForUser(await loadPrinters(), body.userProfile);
          config = getDefaultPrinter(printers);
          if (!config) {
            sendJson(res, 404, { success: false, error: 'No printer configured on desktop. Add a printer in BizPOS Settings.' });
            return;
          }
        }
        const testOrder = {
          orderNumber: 'TEST',
          orderType: 'walkin',
          cart: [{ isDeal: false, productName: 'Test Print Item', quantity: 1, finalPrice: 100, totalPrice: 100 }],
          subtotal: 100,
          paymentMethod: 'Cash',
        };
        try {
          await printReceiptToAny(config, testOrder, body.userProfile || {});
          log.info('[MobilePrint] Test receipt printed');
          sendJson(res, 200, { success: true });
        } catch (printErr) {
          log.error('[MobilePrint] Test print failed:', printErr.message);
          sendJson(res, 502, { success: false, error: `Printer error: ${printErr.message}` });
        }
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
          const printers = filterPrintersForUser(await loadPrinters(), userProfile);
          config = getDefaultPrinter(printers);
          if (!config) {
            sendJson(res, 404, { success: false, error: 'No printer configured on desktop. Add a printer in BizPOS Settings.' });
            return;
          }
        }

        // Await the actual print so the mobile app receives a TRUTHFUL result:
        // success only after the printer accepted the job, an error otherwise.
        // (Previously this responded 200 before printing — a print could fail
        // silently while the app still showed "printed successfully".)
        // Routes to IP, Windows USB, or COM-port printers transparently.
        try {
          await printReceiptToAny(config, orderData, userProfile);
          log.info('[MobilePrint] Receipt printed for order:', orderData?.order_number || orderData?.orderNumber);
          sendJson(res, 200, { success: true });
        } catch (printErr) {
          log.error('[MobilePrint] Receipt print failed:', printErr.message);
          sendJson(res, 502, { success: false, error: `Printer error: ${printErr.message}` });
        }
      } catch (error) {
        log.error('[MobilePrint] Receipt parse error:', error.message);
        sendJson(res, 500, { success: false, error: error.message });
      }
      return;
    }

    // POST /api/print/kitchen
    if (method === 'POST' && url === '/api/print/kitchen') {
      try {
        const { orderData, userProfile, printerConfig } = await parseBody(req);

        const printers = filterPrintersForUser(await loadPrinters(), userProfile);
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
          // Await the print so the mobile app gets a truthful success/failure.
          // Routes to IP, Windows USB, or COM-port printers transparently.
          try {
            await printKitchenToAny(config, orderData, userProfile);
            log.info('[MobilePrint] Kitchen token printed for order:', orderData?.order_number || orderData?.orderNumber);
            sendJson(res, 200, { success: true });
          } catch (printErr) {
            log.error('[MobilePrint] Kitchen token failed:', printErr.message);
            sendJson(res, 502, { success: false, error: `Printer error: ${printErr.message}` });
          }
          return;
        }

        // Route items to printers using category/deal mappings
        const groups = groupItemsByPrinter(items, mappings, printers);
        if (groups.length === 0) {
          // Routing mappings exist, but none of them point at THIS store's
          // printers (stale config, or a newly-added printer that isn't mapped
          // yet). Don't fail — fall back to the kitchen / default printer so
          // the token still prints.
          const fallback = printers.find(p => p.is_kitchen || p.isKitchen)
            || getDefaultPrinter(printers);
          if (!fallback) {
            sendJson(res, 404, { success: false, error: 'No printer configured on desktop.' });
            return;
          }
          try {
            await printKitchenToAny(fallback, orderData, userProfile);
            log.info('[MobilePrint] Kitchen token printed (routing fallback) for order:', orderData?.order_number || orderData?.orderNumber);
            sendJson(res, 200, { success: true });
          } catch (printErr) {
            log.error('[MobilePrint] Kitchen token failed (fallback):', printErr.message);
            sendJson(res, 502, { success: false, error: `Printer error: ${printErr.message}` });
          }
          return;
        }

        // Await every printer group, then report a truthful aggregate result.
        const results = await Promise.allSettled(
          groups.map(({ printerConfig: cfg, items: groupItems }) =>
            printKitchenToAny(cfg, { ...orderData, items: groupItems }, userProfile)
              .then(() => log.info(`[MobilePrint] Kitchen token sent to "${cfg.name}" — ${groupItems.length} item(s)`))
          )
        );
        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length === 0) {
          sendJson(res, 200, { success: true });
        } else if (failed.length < results.length) {
          sendJson(res, 200, { success: true, partial: true, error: `${failed.length} of ${results.length} printers failed` });
        } else {
          log.error('[MobilePrint] All kitchen printers failed:', failed[0].reason?.message);
          sendJson(res, 502, { success: false, error: failed[0].reason?.message || 'All printers failed' });
        }
      } catch (error) {
        log.error('[MobilePrint] Kitchen parse error:', error.message);
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
