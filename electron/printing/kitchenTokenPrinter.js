const net = require('net');
const { generateKitchenTokenESCPOS } = require('./usbPrinter');

/**
 * IP Kitchen Token Printer
 *
 * Generates the SAME ESC/POS binary as the USB kitchen token printer
 * (via generateKitchenTokenESCPOS) and sends it over a raw TCP socket.
 *
 * This guarantees pixel-perfect identical kitchen tokens for both USB and IP printers.
 */

// Send a raw ESC/POS buffer to an IP thermal printer via TCP
function sendRawToIPPrinter(ip, port, buffer) {
  return new Promise((resolve, reject) => {
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

async function printKitchenToken(ip, port, orderData, userProfile) {
  console.log(`🍳 [IP Kitchen] Connecting to ${ip}:${port}`);

  // Generate the exact same ESC/POS buffer as the USB kitchen token printer
  const buffer = await generateKitchenTokenESCPOS(orderData, userProfile);

  // Send over TCP
  await sendRawToIPPrinter(ip, parseInt(port), buffer);
  console.log('✅ [IP Kitchen] Kitchen token sent successfully');
}

module.exports = { printKitchenToken };
