const net = require('net');
const { ensureAssets } = require('../handlers/onDemandAssetDownload');
const { generateReceiptESCPOS } = require('./usbPrinter');

/**
 * IP Receipt Printer
 *
 * Generates the SAME ESC/POS binary as the USB printer (via generateReceiptESCPOS)
 * and sends it over a raw TCP socket to the network printer (port 9100).
 *
 * This guarantees pixel-perfect identical receipts for both USB and IP printers.
 */

// Send a raw ESC/POS buffer to an IP thermal printer via TCP
function sendRawToIPPrinter(ip, port, buffer) {
  return new Promise((resolve, reject) => {
    // Prevent double-settling: once write() succeeds the data is en-route to
    // the printer. Some printers close (RST) immediately after receiving, which
    // would trigger socket 'error' with ECONNRESET and falsely reject an already-
    // successful print. `settled` ensures only the first outcome wins.
    let settled = false;
    const settle = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    const socket = new net.Socket();
    socket.setTimeout(10000);

    socket.connect(parseInt(port), ip, () => {
      // Hand data to the kernel synchronously. For small ESC/POS buffers this
      // effectively delivers the job to the printer.
      socket.write(buffer);
      // Mark settled IMMEDIATELY after write() is called — before any async
      // event (ECONNRESET, error) can fire. Thermal printers often send RST
      // right after receiving data, which can race with the write callback and
      // cause a false failure. Setting settled=true here guarantees that any
      // subsequent socket error is ignored once the data is in-flight.
      settled = true;
      setTimeout(() => {
        socket.destroy();
        resolve({ success: true });
      }, 300);
    });

    socket.on('error', (err) => {
      socket.destroy();
      settle(reject, err);
    });

    socket.on('timeout', () => {
      socket.destroy();
      settle(reject, new Error('Connection timeout after 10s'));
    });
  });
}

async function printReceipt(ip, port, orderData, userProfile) {
  console.log(`🖨️ [IP Receipt] Connecting to ${ip}:${port}`);

  // Download logo / QR if needed (same as USB path)
  const assets = await ensureAssets(
    userProfile?.store_logo,
    userProfile?.qr_code
  );

  console.log('Logo asset:', assets.logo || 'none');
  console.log('QR asset:', assets.qr || 'none');

  // Generate the exact same ESC/POS buffer as the USB printer
  const buffer = await generateReceiptESCPOS(orderData, userProfile, assets);

  // Send over TCP
  await sendRawToIPPrinter(ip, port, buffer);
  console.log('✅ [IP Receipt] Print job sent successfully');
}

function registerReceiptPrinter(ipcMain) {
  ipcMain.handle('printer-print-receipt', async (event, { orderData, userProfile, printerConfig }) => {
    try {
      const printerType = printerConfig.printer_type || 'ip';

      if (printerType === 'usb') {
        console.log('Receipt printing routed to USB handler');
        return { success: false, error: 'Use printer-print-usb for USB printers' };
      }

      const ip = printerConfig.ip_address || printerConfig.ip;
      const port = parseInt(printerConfig.port || '9100');
      await printReceipt(ip, port, orderData, userProfile);
      return { success: true };
    } catch (error) {
      console.error('Error printing receipt:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('printer-raw-test', async (event, { ip, port = '9100' }) => {
    try {
      const ESC = 0x1B;
      const GS = 0x1D;
      const testBuffer = Buffer.concat([
        Buffer.from([ESC, 0x40]),                    // Init
        Buffer.from([ESC, 0x61, 0x01]),              // Center
        Buffer.from('TEST PRINT\n', 'utf8'),
        Buffer.from('------------------------------------------\n', 'utf8'),
        Buffer.from('Printer is working fine!\n', 'utf8'),
        Buffer.from([ESC, 0x61, 0x00]),              // Left
        Buffer.from('\n\n\n'),
        Buffer.from([GS, 0x56, 0x41, 0x00])          // Cut
      ]);
      await sendRawToIPPrinter(ip, parseInt(port), testBuffer);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerReceiptPrinter, printReceipt };
