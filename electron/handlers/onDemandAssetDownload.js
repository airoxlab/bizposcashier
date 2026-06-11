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

// Deduplicates background refresh — parallel prints share one download, not N
let _bgRefreshPromise = null;

function _startBackgroundRefresh(logoUrl, qrUrl) {
  if (_bgRefreshPromise) return;
  _bgRefreshPromise = (async () => {
    try {
      const { LOGO_PATH, QR_PATH } = getPaths();
      const downloads = [];
      if (logoUrl) downloads.push(downloadFile(logoUrl, LOGO_PATH).catch(() => {}));
      if (qrUrl)   downloads.push(downloadFile(qrUrl, QR_PATH).catch(() => {}));
      await Promise.all(downloads);
      await saveDownloadMeta(logoUrl, qrUrl);
      console.log('✅ Background asset refresh complete');
    } catch (e) {
      console.warn('⚠️ Background asset refresh failed:', e.message);
    } finally {
      _bgRefreshPromise = null;
    }
  })();
}

/**
 * Ensure assets are available before printing.
 *
 * Stale-while-revalidate: if cached files exist on disk, return them immediately
 * (printing is never blocked by a network download). If the files are stale or
 * the source URL changed, a background refresh runs so the NEXT print gets fresh
 * assets. Only the very first ever use (no files at all) waits for the download.
 */
async function ensureAssets(logoUrl, qrUrl) {
  ensureTempDir();
  const { LOGO_PATH, QR_PATH } = getPaths();

  const logoExists = fs.existsSync(LOGO_PATH);
  const qrExists   = fs.existsSync(QR_PATH);
  const needsLogo  = !!logoUrl;
  const needsQr    = !!qrUrl;

  // Files exist — return immediately, refresh in background if stale
  if ((!needsLogo || logoExists) && (!needsQr || qrExists)) {
    areAssetsFresh(logoUrl, qrUrl).then(isFresh => {
      if (!isFresh) _startBackgroundRefresh(logoUrl, qrUrl);
    }).catch(() => {});
    console.log('⚡ Using cached assets (instant)');
    return {
      logo: logoExists ? LOGO_PATH : null,
      qr:   qrExists   ? QR_PATH   : null,
      cached: true
    };
  }

  // No files yet — must download now (first-ever use only)
  console.log('📥 No cached assets — downloading for first time...');
  const downloads = [];
  if (logoUrl) {
    downloads.push(
      downloadFile(logoUrl, LOGO_PATH)
        .then(() => ({ type: 'logo', path: LOGO_PATH, success: true }))
        .catch(err => ({ type: 'logo', success: false, error: err.message }))
    );
  }
  if (qrUrl) {
    downloads.push(
      downloadFile(qrUrl, QR_PATH)
        .then(() => ({ type: 'qr', path: QR_PATH, success: true }))
        .catch(err => ({ type: 'qr', success: false, error: err.message }))
    );
  }
  const downloadResults = await Promise.all(downloads);
  const results = {};
  downloadResults.forEach(r => {
    if (r.success) { results[r.type] = r.path; console.log(`✅ ${r.type} processed`); }
    else           { console.error(`❌ ${r.type} failed:`, r.error); }
  });
  saveDownloadMeta(logoUrl, qrUrl).catch(err =>
    console.error('❌ saveDownloadMeta failed:', err.message)
  );
  return results;
}

module.exports = { ensureAssets };
