const fs = require('fs');
const path = require('path');
const https = require('https');
const { app } = require('electron');

/**
 * On-Demand Asset Downloader
 * Downloads logo/QR only when needed for printing (if not cached)
 */

// Compute TEMP_DIR lazily so it is never evaluated before app.ready
function getTempDir() {
  try {
    if (app && app.isReady()) {
      return path.join(app.getPath('userData'), 'printer-assets');
    }
  } catch { /* app not ready yet */ }
  // Fallback to a writable location relative to this file
  return path.join(require('os').tmpdir(), 'bizpos-printer-assets');
}

// Ensure temp directory exists and return its path
function ensureTempDir() {
  const dir = getTempDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Dynamic paths — evaluated at call time, not module load time
function getPaths() {
  const dir = getTempDir();
  return {
    LOGO_PATH: path.join(dir, 'logo.png'),
    QR_PATH:   path.join(dir, 'qr.png'),
    META_PATH: path.join(dir, 'download_meta.json'),
  };
}

// Generate a compact fingerprint for a URL so we never write multi-MB base64 to the meta file.
// For regular URLs: store as-is (short).
// For base64 data URIs: store only the mime type + length + first 32 chars of payload (fast to compute, unique enough).
function urlFingerprint(url) {
  if (!url) return null;
  if (!url.startsWith('data:image/')) return url;
  // e.g. "data:image/png;base64,iVBORw0KG..." → fingerprint includes type + length + prefix
  const commaIdx = url.indexOf(',');
  const header = commaIdx > 0 ? url.substring(0, commaIdx + 1) : url.substring(0, 30);
  const payload = commaIdx > 0 ? url.substring(commaIdx + 1) : '';
  return `${header}[len=${payload.length},head=${payload.substring(0, 32)}]`;
}

// Save base64 data to file — async to avoid blocking the main process
function saveBase64ToFile(base64Data, destPath) {
  return new Promise((resolve, reject) => {
    try {
      if (!base64Data) {
        return resolve(null);
      }

      // Extract base64 data (remove data:image/png;base64, prefix)
      const matches = base64Data.match(/^data:image\/\w+;base64,(.+)$/s);
      if (!matches) {
        return reject(new Error('Invalid base64 format'));
      }

      const buffer = Buffer.from(matches[1], 'base64');
      fs.writeFile(destPath, buffer, (err) => {
        if (err) return reject(err);
        console.log('✅ Base64 data saved to file:', destPath);
        resolve(destPath);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Download file from URL (with 20s timeout so we never hang indefinitely)
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    if (!url) {
      return resolve(null);
    }

    // Check if it's base64 data instead of URL
    if (url.startsWith('data:image/')) {
      return saveBase64ToFile(url, destPath).then(resolve).catch(reject);
    }

    // Try to delete any stale/locked file before writing
    if (fs.existsSync(destPath)) {
      try { fs.unlinkSync(destPath); } catch { /* ignore — stream error handler will catch below */ }
    }

    let file;
    try {
      file = fs.createWriteStream(destPath);
    } catch (streamErr) {
      console.error('❌ Cannot open write stream (EPERM?):', streamErr.message);
      return reject(streamErr);
    }

    let settled = false;
    const settle = (fn, val) => { if (!settled) { settled = true; fn(val); } };

    const req = https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        if (fs.existsSync(destPath)) try { fs.unlinkSync(destPath); } catch {}
        return downloadFile(response.headers.location, destPath)
          .then(v => settle(resolve, v))
          .catch(e => settle(reject, e));
      }

      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(destPath)) try { fs.unlinkSync(destPath); } catch {}
        return settle(reject, new Error(`HTTP ${response.statusCode}`));
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        settle(resolve, destPath);
      });
      file.on('error', (err) => {
        file.close();
        if (fs.existsSync(destPath)) try { fs.unlinkSync(destPath); } catch {}
        settle(reject, err);
      });
    });

    req.on('error', (err) => {
      try { file.close(); } catch {}
      if (fs.existsSync(destPath)) try { fs.unlinkSync(destPath); } catch {}
      settle(reject, err);
    });

    // Hard timeout — prevents indefinite hangs on slow/unreachable servers
    req.setTimeout(20000, () => {
      req.destroy();
      try { file.close(); } catch {}
      if (fs.existsSync(destPath)) try { fs.unlinkSync(destPath); } catch {}
      settle(reject, new Error('Asset download timeout after 20s'));
    });
  });
}

// Check if assets are fresh (downloaded today AND source hasn't changed).
// Uses fingerprints so we never read back a multi-MB meta file.
async function areAssetsFresh(logoUrl, qrUrl) {
  const { META_PATH } = getPaths();
  if (!fs.existsSync(META_PATH)) return false;

  try {
    const data = await fs.promises.readFile(META_PATH, 'utf8');
    const meta = JSON.parse(data);
    const lastDownload = new Date(meta.lastDownload);
    const today = new Date();

    const isSameDay = (
      lastDownload.getDate() === today.getDate() &&
      lastDownload.getMonth() === today.getMonth() &&
      lastDownload.getFullYear() === today.getFullYear()
    );

    const urlsChanged = (
      meta.logoFingerprint !== urlFingerprint(logoUrl) ||
      meta.qrFingerprint   !== urlFingerprint(qrUrl)
    );
    return isSameDay && !urlsChanged;
  } catch {
    return false;
  }
}

// Save download timestamp — stores only tiny fingerprints, never raw base64.
async function saveDownloadMeta(logoUrl, qrUrl) {
  const { META_PATH } = getPaths();
  try {
    await fs.promises.writeFile(META_PATH, JSON.stringify({
      lastDownload: new Date().toISOString(),
      logoFingerprint: urlFingerprint(logoUrl),
      qrFingerprint:   urlFingerprint(qrUrl),
    }, null, 2));
  } catch (err) {
    console.error('❌ Could not save download meta:', err.message);
  }
}

/**
 * Ensure assets are available before printing.
 * Returns immediately with cached assets when available; downloads/processes otherwise.
 */
async function ensureAssets(logoUrl, qrUrl) {
  console.log('🔍 ensureAssets called with:');
  console.log('  - logoUrl:', logoUrl ? (logoUrl.startsWith('data:') ? `BASE64 (${logoUrl.length} chars)` : logoUrl) : 'NULL');
  console.log('  - qrUrl:', qrUrl ? (qrUrl.length > 100 ? `${qrUrl.substring(0, 50)}...` : qrUrl) : 'NULL');

  ensureTempDir();
  const { LOGO_PATH, QR_PATH } = getPaths();

  const isFresh = await areAssetsFresh(logoUrl, qrUrl);
  const logoExists = fs.existsSync(LOGO_PATH);
  const qrExists = fs.existsSync(QR_PATH);

  console.log('  - isFresh:', isFresh);
  console.log('  - logoExists:', logoExists);
  console.log('  - qrExists:', qrExists);

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

  console.log('📥 Processing assets (first print or updated)...');
  const downloads = [];

  if (logoUrl) {
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

  // Wait for both downloads/processing steps
  const downloadResults = await Promise.all(downloads);

  // Process results
  const results = {};
  downloadResults.forEach(result => {
    if (result.success) {
      results[result.type] = result.path;
      console.log(`✅ ${result.type} processed`);
    } else {
      console.error(`❌ ${result.type} failed:`, result.error);
    }
  });

  // Save compact meta (async, non-blocking)
  saveDownloadMeta(logoUrl, qrUrl).catch(err =>
    console.error('❌ saveDownloadMeta failed:', err.message)
  );

  return results;
}

module.exports = { ensureAssets };
