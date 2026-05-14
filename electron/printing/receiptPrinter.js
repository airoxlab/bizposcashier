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
//
// Correctness contract (replaces the old fire-and-forget 300ms-timer impl):
//   1. Connect to ip:port.
//   2. socket.write(buffer, cb) — cb fires only after the kernel has accepted
//      every byte. For large receipts (logo + QR images) this can take well
//      over 300ms on slow networks; the old impl destroyed the socket too
//      early and printed truncated receipts.
//   3. socket.end() — sends FIN, the canonical "end of job" signal for port
//      9100 raw printing. The kernel drains any remaining data first.
//   4. Resolve on 'close' (clean shutdown) or on an ECONNRESET/EPIPE that
//      arrives *after* the write completed — many thermal printers send RST
//      the instant they're done consuming the job; that's success, not failure.
//   5. If the printer keeps the socket open and we hit the idle timeout after
//      the write was acknowledged, treat as success and force-close ourselves.
//   6. Anything before the write callback fires is a real failure (reject).
function sendRawToIPPrinter(ip, port, buffer) {
  return new Promise((resolve, reject) => {
    let writeDone = false;
    let settled = false;
    const settle = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    const socket = new net.Socket();
    // Idle timeout — applies to inactivity, not total duration. 15s gives slow
    // networks + heavy image payloads enough headroom.
    socket.setTimeout(15000);

    socket.connect(parseInt(port), ip, () => {
      console.log(`🔌 [IP Receipt] Connected to ${ip}:${port}, writing ${buffer.length} bytes`);
      socket.write(buffer, (err) => {
        if (err) {
          socket.destroy();
          return settle(reject, err);
        }
        writeDone = true;
        console.log(`✅ [IP Receipt] ${buffer.length} bytes flushed to kernel`);
        // Graceful close — kernel sends FIN after the send buffer drains.
        socket.end();
      });
    });

    socket.on('close', () => {
      if (writeDone) {
        settle(resolve, { success: true });
      } else {
        settle(reject, new Error('Connection closed before data was sent'));
      }
    });

    socket.on('error', (err) => {
      // Printer-side RST after consuming the job is the common pattern for
      // port-9100 thermal printers. If our write already completed, the data
      // is already on paper — ignore the RST.
      if (writeDone && (err.code === 'ECONNRESET' || err.code === 'EPIPE')) {
        console.log(`ℹ️  [IP Receipt] Printer closed connection (${err.code}) after write — treating as success`);
        socket.destroy();
        return settle(resolve, { success: true });
      }
      console.error('❌ [IP Receipt] Socket error:', err.code || err.message);
      socket.destroy();
      settle(reject, err);
    });

    socket.on('timeout', () => {
      // Some printers keep the connection open indefinitely after the job.
      // If the write already completed, the print itself succeeded.
      if (writeDone) {
        console.log('ℹ️  [IP Receipt] Printer kept socket open after write — forcing close');
        socket.destroy();
        return settle(resolve, { success: true });
      }
      socket.destroy();
      settle(reject, new Error(`No activity from ${ip}:${port} for 15s`));
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
