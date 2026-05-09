const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');

async function createIcns() {
  const sourceIcon = path.join(__dirname, '../electron/assets/icon.png');
  const outputIcon = path.join(__dirname, '../electron/assets/icon.icns');

  const sizes = [
    { size: 16,   type: 'icp4' },
    { size: 32,   type: 'icp5' },
    { size: 64,   type: 'icp6' },
    { size: 128,  type: 'ic07' },
    { size: 256,  type: 'ic08' },
    { size: 512,  type: 'ic09' },
    { size: 1024, type: 'ic10' },
  ];

  const image = await loadImage(sourceIcon);
  const chunks = [];

  for (const { size, type } of sizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, size, size);

    const pngBuffer = canvas.toBuffer('image/png');
    const block = Buffer.alloc(8 + pngBuffer.length);
    block.write(type, 0, 'ascii');
    block.writeUInt32BE(8 + pngBuffer.length, 4);
    pngBuffer.copy(block, 8);
    chunks.push(block);
  }

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(8 + body.length, 4);

  fs.writeFileSync(outputIcon, Buffer.concat([header, body]));
  console.log('Created:', outputIcon);
}

createIcns().catch(err => { console.error(err.message); process.exit(1); });
