const { generateKitchenTokenESCPOS } = require('./usbPrinter');
const { sendRawToIPPrinter } = require('./receiptPrinter');

/**
 * IP Kitchen Token Printer
 *
 * Generates the SAME ESC/POS binary as the USB kitchen token printer
 * (via generateKitchenTokenESCPOS) and sends it over a raw TCP socket.
 *
 * This guarantees pixel-perfect identical kitchen tokens for both USB and IP
 * printers, and shares the robust chunked sender used for receipts — the old
 * fire-and-forget impl here (write() with no callback, then socket.destroy()
 * after a hard 300ms) killed the socket before the data left the kernel on
 * slow networks, so kitchen tokens silently failed to print.
 */

async function printKitchenToken(ip, port, orderData, userProfile) {
  console.log(`🍳 [IP Kitchen] Connecting to ${ip}:${port}`);

  // Generate the exact same ESC/POS buffer as the USB kitchen token printer
  const buffer = await generateKitchenTokenESCPOS(orderData, userProfile);

  // Send over TCP — retry once on failure. Every rejection from
  // sendRawToIPPrinter happens before the job reaches the printer, so a retry
  // can never cause a double print.
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await sendRawToIPPrinter(ip, parseInt(port), buffer);
      console.log(`✅ [IP Kitchen] Kitchen token sent successfully${attempt > 1 ? ` (attempt ${attempt})` : ''}`);
      return;
    } catch (err) {
      lastErr = err;
      console.warn(`⚠️  [IP Kitchen] Attempt ${attempt}/2 failed: ${err.message}`);
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw lastErr;
}

module.exports = { printKitchenToken };
