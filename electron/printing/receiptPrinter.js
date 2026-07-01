const net = require('net');
const { ensureAssets } = require('../handlers/onDemandAssetDownload');
const { generateReceiptESCPOS, generateCashReportESCPOS } = require('./usbPrinter');

/**
 * IP Receipt Printer
 *
 * Generates the SAME ESC/POS binary as the USB printer (via generateReceiptESCPOS)
 * and sends it over a raw TCP socket to the network printer (port 9100).
 *
 * This guarantees pixel-perfect identical receipts for both USB and IP printers.
 */

// Per-write chunk size + inter-chunk delay. Cheap network thermal printers
// (the common Xprinter / Black Copper / generic-ESC-POS units) have very small
// TCP receive buffers. A single large socket.write() burst — a receipt is tens
// of KB once a logo + QR raster is included — overruns that buffer: the printer
// drops bytes (garbled / blank output) or stops ACKing entirely (we then hit
// the idle timeout and report "timeout"). Streaming the job in small chunks
// with a short gap lets the printer's firmware drain between writes.
const CHUNK_SIZE = 2048;
const CHUNK_DELAY_MS = 20;
// Grace period after the last byte before sending FIN. Some cheap printers
// stop processing the moment they see FIN and truncate the tail of the job.
const PRE_FIN_GRACE_MS = 400;

// Send a raw ESC/POS buffer to an IP thermal printer via TCP.
//
// Correctness contract:
//   1. Connect to ip:port (dedicated 8s connect timeout).
//   2. Stream the buffer in CHUNK_SIZE pieces; await each write() callback and
//      pause CHUNK_DELAY_MS between chunks so a slow printer never overruns.
//   3. After the last byte, wait PRE_FIN_GRACE_MS, then socket.end() — FIN is
//      the canonical "end of job" signal for port-9100 raw printing.
//   4. Resolve on 'close' (clean shutdown) or on an ECONNRESET/EPIPE that
//      arrives *after* the write completed — many thermal printers send RST
//      the instant they're done consuming the job; that's success, not failure.
//   5. If the printer keeps the socket open and we hit the idle timeout after
//      the write finished, treat as success and force-close ourselves.
//   6. Anything before the last chunk is acknowledged is a real failure (reject).
function sendRawToIPPrinter(ip, port, buffer) {
  return new Promise((resolve, reject) => {
    let writeDone = false;
    let settled = false;
    let connected = false;
    const settle = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    const socket = new net.Socket();
    socket.setNoDelay(true);          // push each chunk out immediately (no Nagle batching)
    socket.setTimeout(20000);         // idle timeout — inactivity, not total duration

    // Dedicated connect timeout — an unreachable printer fails in 8s instead of
    // hanging for the full idle window.
    const connectTimer = setTimeout(() => {
      if (!connected) {
        socket.destroy();
        settle(reject, new Error(`Could not connect to ${ip}:${port} within 8s`));
      }
    }, 8000);

    const writeChunk = (offset) => {
      if (settled) return;
      if (offset >= buffer.length) {
        writeDone = true;
        console.log(`✅ [IP Receipt] All ${buffer.length} bytes flushed to kernel`);
        // Let a slow printer process the tail before FIN.
        setTimeout(() => { if (!settled) socket.end(); }, PRE_FIN_GRACE_MS);
        return;
      }
      const slice = buffer.subarray(offset, offset + CHUNK_SIZE);
      socket.write(slice, (err) => {
        if (err) { socket.destroy(); return settle(reject, err); }
        setTimeout(() => writeChunk(offset + CHUNK_SIZE), CHUNK_DELAY_MS);
      });
    };

    socket.connect(parseInt(port), ip, () => {
      connected = true;
      clearTimeout(connectTimer);
      console.log(`🔌 [IP Receipt] Connected to ${ip}:${port}, streaming ${buffer.length} bytes`);
      writeChunk(0);
    });

    socket.on('close', () => {
      clearTimeout(connectTimer);
      if (writeDone) {
        settle(resolve, { success: true });
      } else {
        settle(reject, new Error('Connection closed before data was sent'));
      }
    });

    socket.on('error', (err) => {
      clearTimeout(connectTimer);
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
      settle(reject, new Error(`No activity from ${ip}:${port} for 20s`));
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

  // Send over TCP — retry once on failure. Every rejection from
  // sendRawToIPPrinter happens BEFORE the job reaches the printer (post-write
  // states resolve as success), so a retry can never cause a double print.
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await sendRawToIPPrinter(ip, port, buffer);
      console.log(`✅ [IP Receipt] Print job sent successfully${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`⚠️  [IP Receipt] Attempt ${attempt}/2 failed: ${err.message}`);
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw lastErr;
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

  // Print cash report (Z-report) to an IP thermal printer. Mirrors
  // printer-print-receipt but generates the report ESC/POS buffer.
  ipcMain.handle('printer-print-report', async (event, { reportData, userProfile, printerConfig }) => {
    try {
      const printerType = printerConfig.printer_type || 'ip';
      if (printerType === 'usb') {
        return { success: false, error: 'Use printer-print-usb-report for USB printers' };
      }
      const ip = printerConfig.ip_address || printerConfig.ip;
      const port = parseInt(printerConfig.port || '9100');

      const assets = await ensureAssets(userProfile?.store_logo, userProfile?.qr_code);
      const buffer = await generateCashReportESCPOS(reportData, userProfile, assets);

      let lastErr;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await sendRawToIPPrinter(ip, port, buffer);
          console.log(`✅ [IP Cash Report] sent${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
          return { success: true };
        } catch (err) {
          lastErr = err;
          console.warn(`⚠️  [IP Cash Report] attempt ${attempt}/2 failed: ${err.message}`);
          if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
        }
      }
      throw lastErr;
    } catch (error) {
      console.error('Error printing cash report:', error);
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

module.exports = { registerReceiptPrinter, printReceipt, sendRawToIPPrinter };
