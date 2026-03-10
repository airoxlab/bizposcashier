const fs = require('fs');
const path = require('path');
const https = require('https');
const { app } = require('electron');

/**
 * On-Demand Asset Downloader
 * Downloads logo/QR only when needed for printing (if not cached)
 */

// Use app.getPath('userData') for writable temp directory (not inside asar)
const TEMP_DIR = app ? path.join(app.getPath('userData'), 'printer-assets') : path.join(__dirname, '..', 'printing', 'temp');
const LOGO_PATH = path.join(TEMP_DIR, 'logo.png');
const QR_PATH = path.join(TEMP_DIR, 'qr.png');
const META_PATH = path.join(TEMP_DIR, 'download_meta.json');

// Ensure temp directory exists
function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

// Save base64 data to file
function saveBase64ToFile(base64Data, destPath) {
  return new Promise((resolve, reject) => {
    try {
      if (!base64Data) {
        return resolve(null);
      }

      // Extract base64 data (remove data:image/png;base64, prefix)
      const matches = base64Data.match(/^data:image\/\w+;base64,(.+)$/);
      if (!matches) {
        return reject(new Error('Invalid base64 format'));
      }

      const buffer = Buffer.from(matches[1], 'base64');
      fs.writeFileSync(destPath, buffer);
      console.log('✅ Base64 data saved to file:', destPath);
      resolve(destPath);
    } catch (error) {
      reject(error);
    }
  });
}

// Download file from URL
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    if (!url) {
      return resolve(null);
    }

    // Check if it's base64 data instead of URL
    if (url.startsWith('data:image/')) {
      return saveBase64ToFile(url, destPath).then(resolve).catch(reject);
    }

    const file = fs.createWriteStream(destPath);

    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return reject(new Error(`HTTP ${response.statusCode}`));
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
      file.on('error', (err) => {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        reject(err);
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

// Check if assets are fresh (downloaded today AND URLs haven't changed)
function areAssetsFresh(logoUrl, qrUrl) {
  if (!fs.existsSync(META_PATH)) return false;

  try {
    const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
    const lastDownload = new Date(meta.lastDownload);
    const today = new Date();

    // Check if it's the same day
    const isSameDay = (
      lastDownload.getDate() === today.getDate() &&
      lastDownload.getMonth() === today.getMonth() &&
      lastDownload.getFullYear() === today.getFullYear()
    );

    // Check if URLs have changed
    const urlsChanged = (
      meta.logoUrl !== logoUrl ||
      meta.qrUrl !== qrUrl
    );

    // Assets are fresh only if same day AND URLs haven't changed
    return isSameDay && !urlsChanged;
  } catch {
    return false;
  }
}

// Save download timestamp and URLs
function saveDownloadMeta(logoUrl, qrUrl) {
  const meta = {
    lastDownload: new Date().toISOString(),
    logoUrl: logoUrl || null,
    qrUrl: qrUrl || null
  };
  fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2));
}

/**
 * Ensure assets are available before printing
 * Returns immediately with cached assets if available
 * Downloads in background if needed
 */
async function ensureAssets(logoUrl, qrUrl) {
  console.log('🔍 ensureAssets called with:');
  console.log('  - logoUrl:', logoUrl ? (logoUrl.startsWith('data:') ? `BASE64 (${logoUrl.length} chars)` : logoUrl) : 'NULL');
  console.log('  - qrUrl:', qrUrl ? (qrUrl.length > 100 ? `${qrUrl.substring(0, 50)}...` : qrUrl) : 'NULL');

  ensureTempDir();

  // Quick synchronous check - return immediately if cached
  const isFresh = areAssetsFresh(logoUrl, qrUrl);
  const logoExists = fs.existsSync(LOGO_PATH);
  const qrExists = fs.existsSync(QR_PATH);

  console.log('  - isFresh:', isFresh);
  console.log('  - logoExists:', logoExists);
  console.log('  - qrExists:', qrExists);

  // Check if we can use cached assets (only need the ones that are requested)
  const needsLogo = !!logoUrl;
  const needsQr = !!qrUrl;
  const hasLogoIfNeeded = !needsLogo || logoExists;
  const hasQrIfNeeded = !needsQr || qrExists;

  if (isFresh && hasLogoIfNeeded && hasQrIfNeeded) {
    console.log('⚡ Using cached assets (instant)');
    return {
      logo: logoExists ? LOGO_PATH : null,
      qr: qrExists ? QR_PATH : null,
      cached: true
    };
  }

  // Assets need refresh - download in parallel for speed
  console.log('📥 Processing assets (first print or updated)...');
  console.log('  - Will process logo:', needsLogo);
  console.log('  - Will process QR:', needsQr);

  // Only delete and re-download assets that need updating
  const downloads = [];

  if (logoUrl) {
    // Delete old logo if exists
    if (fs.existsSync(LOGO_PATH)) {
      console.log('  - Deleting old logo file');
      fs.unlinkSync(LOGO_PATH);
    }

    downloads.push(
      downloadFile(logoUrl, LOGO_PATH)
        .then(() => {
          console.log('✅ Logo processed successfully');
          return { type: 'logo', path: LOGO_PATH, success: true };
        })
        .catch(err => {
          console.error('❌ Logo processing failed:', err.message);
          return { type: 'logo', success: false, error: err.message };
        })
    );
  }

  if (qrUrl) {
    // Delete old QR if exists
    if (fs.existsSync(QR_PATH)) {
      console.log('  - Deleting old QR file');
      fs.unlinkSync(QR_PATH);
    }

    downloads.push(
      downloadFile(qrUrl, QR_PATH)
        .then(() => {
          console.log('✅ QR processed successfully');
          return { type: 'qr', path: QR_PATH, success: true };
        })
        .catch(err => {
          console.error('❌ QR processing failed:', err.message);
          return { type: 'qr', success: false, error: err.message };
        })
    );
  }

  // Wait for both downloads
  const downloadResults = await Promise.all(downloads);

  // Process results
  const results = {};
  downloadResults.forEach(result => {
    if (result.success) {
      results[result.type] = result.path;
      console.log(`✅ ${result.type} downloaded`);
    } else {
      console.error(`❌ ${result.type} download failed:`, result.error);
    }
  });

  // Save timestamp and URLs
  saveDownloadMeta(logoUrl, qrUrl);

  return results;
}

module.exports = { ensureAssets };
