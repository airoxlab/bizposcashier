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
    const socket = new net.Socket();
    socket.setTimeout(10000);

    socket.connect(parseInt(port), ip, () => {
      socket.write(buffer, (err) => {
        if (err) {
          socket.destroy();
          return reject(err);
        }
        setTimeout(() => {
          socket.destroy();
          resolve({ success: true });
        }, 500);
      });
    });

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Connection timeout after 10s'));
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
