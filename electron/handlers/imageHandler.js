const { app } = require('electron');
const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

const IMAGE_DIR_NAME = 'product-images';

function getImageDir() {
  return path.join(app.getPath('userData'), IMAGE_DIR_NAME);
}

// Download a single file from url → destPath, following one redirect.
function downloadFile(url, destPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) { reject(new Error('Too many redirects')); return; }
    const proto = url.startsWith('https') ? https : http;
    const file  = fs.createWriteStream(destPath);

    proto.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlink(destPath, () => {});
        downloadFile(res.headers.location, destPath, redirectCount + 1)
          .then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
    }).on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

function getExt(url) {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase().split('?')[0];
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return ext;
  } catch (_) {}
  return '.jpg';
}

function registerImageHandlers(ipcMain) {

  // ── Download all product/deal images into userData/product-images/ ──────
  // items: [{ id: string, url: string, type: 'product' | 'deal' }]
  // Returns: { success: true, mapping: { [remoteUrl]: filename } }
  ipcMain.handle('images:download-all', async (_event, items) => {
    const imgDir = getImageDir();
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

    const mapping = {};
    const CONCURRENCY = 4;

    for (let i = 0; i < items.length; i += CONCURRENCY) {
      await Promise.all(
        items.slice(i, i + CONCURRENCY).map(async ({ id, url, type }) => {
          if (!url || !id) return;
          try {
            const filename = `${type}_${id}${getExt(url)}`;
            const destPath  = path.join(imgDir, filename);
            await downloadFile(url, destPath);
            mapping[url] = filename;
          } catch (_) {
            // Non-critical — renderer will fall back to remote URL
          }
        })
      );
    }

    console.log(`[ImageHandler] Downloaded ${Object.keys(mapping).length}/${items.length} images`);
    return { success: true, mapping };
  });

  // ── Delete all cached images (called before re-download on refresh) ──────
  ipcMain.handle('images:clear-all', async () => {
    const imgDir = getImageDir();
    if (fs.existsSync(imgDir)) {
      fs.rmSync(imgDir, { recursive: true, force: true });
    }
    console.log('[ImageHandler] Cleared product-images folder');
    return { success: true };
  });
}

module.exports = { registerImageHandlers, getImageDir };
