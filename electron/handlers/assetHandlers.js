const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

/**
 * Asset Handlers - Downloads and manages store logo and QR code
 * Downloads from Supabase bucket links and saves to temp folder
 */

// Get temp directory path
function getTempDir() {
  return path.join(__dirname, '..', 'printing', 'temp');
}

// Ensure temp directory exists
function ensureTempDir() {
  const tempDir = getTempDir();
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log('✅ Created temp directory:', tempDir);
  }
  return tempDir;
}

// Download file from URL
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`📡 [Download] Starting download from: ${url}`);
    console.log(`📁 [Download] Destination: ${destPath}`);

    // Ensure parent directory exists before writing
    try {
      const dir = path.dirname(destPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (dirErr) {
      console.error(`❌ [Download] Cannot create directory:`, dirErr.message);
      return reject(dirErr);
    }

    // If file is locked from a previous crashed session, try to remove it first
    if (fs.existsSync(destPath)) {
      try { fs.unlinkSync(destPath); } catch { /* ignore — createWriteStream will overwrite or fail below */ }
    }

    let file;
    try {
      file = fs.createWriteStream(destPath);
    } catch (streamErr) {
      console.error(`❌ [Download] Cannot open write stream (EPERM?):`, streamErr.message);
      return reject(streamErr);
    }

    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, (response) => {
      console.log(`📊 [Download] Response status: ${response.statusCode}`);

      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        console.log(`↪️ [Download] Redirect to: ${response.headers.location}`);
        file.close();
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        downloadFile(response.headers.location, destPath)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        const error = new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`);
        console.error(`❌ [Download] ${error.message}`);
        reject(error);
        return;
      }

      let downloadedBytes = 0;
      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close(() => {
          console.log(`✅ [Download] Complete: ${path.basename(destPath)} (${downloadedBytes} bytes)`);
          resolve(destPath);
        });
      });

      file.on('error', (err) => {
        console.error(`❌ [Download] File write error:`, err);
        file.close();
        if (fs.existsSync(destPath)) {
          fs.unlinkSync(destPath);
        }
        reject(err);
      });
    });

    request.on('error', (err) => {
      console.error(`❌ [Download] Network error:`, err);
      file.close();
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      reject(err);
    });

    request.setTimeout(30000, () => {
      console.error(`❌ [Download] Timeout after 30s`);
      request.destroy();
      file.close();
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      reject(new Error('Download timeout'));
    });
  });
}

// Get last download date
function getLastDownloadDate() {
  const tempDir = getTempDir();
  const metaPath = path.join(tempDir, 'download_meta.json');

  if (fs.existsSync(metaPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      return data.lastDownload;
    } catch (err) {
      console.error('Error reading download meta:', err);
      return null;
    }
  }

  return null;
}

// Save last download date
function saveLastDownloadDate() {
  const tempDir = getTempDir();
  const metaPath = path.join(tempDir, 'download_meta.json');

  const data = {
    lastDownload: new Date().toISOString()
  };

  fs.writeFileSync(metaPath, JSON.stringify(data, null, 2));
}

// Check if assets need to be refreshed (different day)
function shouldRefreshAssets() {
  const lastDownload = getLastDownloadDate();

  if (!lastDownload) {
    return true; // Never downloaded before
  }

  const lastDate = new Date(lastDownload);
  const today = new Date();

  // Check if it's a different day
  const isDifferentDay =
    lastDate.getDate() !== today.getDate() ||
    lastDate.getMonth() !== today.getMonth() ||
    lastDate.getFullYear() !== today.getFullYear();

  return isDifferentDay;
}

// Delete old assets
function deleteOldAssets() {
  const tempDir = getTempDir();
  const logoPath = path.join(tempDir, 'logo.png');
  const qrPath = path.join(tempDir, 'qr.png');

  let deleted = false;

  if (fs.existsSync(logoPath)) {
    fs.unlinkSync(logoPath);
    console.log('🗑️ Deleted old logo');
    deleted = true;
  }

  if (fs.existsSync(qrPath)) {
    fs.unlinkSync(qrPath);
    console.log('🗑️ Deleted old QR code');
    deleted = true;
  }

  return deleted;
}

// Register IPC handlers
function registerAssetHandlers(ipcMain) {

  /**
   * Download assets (logo and QR code) from Supabase bucket
   */
  ipcMain.handle('download-store-assets', async (event, { logoUrl, qrUrl }) => {
    try {
      console.log('📥 [AssetHandlers] Starting asset download...');
      console.log('Logo URL:', logoUrl || 'null/undefined');
      console.log('QR URL:', qrUrl || 'null/undefined');

      // Ensure temp directory exists
      const tempDir = ensureTempDir();

      // Check if we should refresh (new day)
      const shouldRefresh = shouldRefreshAssets();

      if (shouldRefresh) {
        console.log('🔄 New day detected - deleting old assets');
        deleteOldAssets();
      } else {
        console.log('✓ Assets already downloaded today');
      }

      const results = {
        logo: null,
        qr: null
      };

      // Download logo if URL provided and valid
      if (logoUrl && typeof logoUrl === 'string' && logoUrl.trim()) {
        try {
          const logoPath = path.join(tempDir, 'logo.png');

          // Skip download if file exists and it's the same day
          if (fs.existsSync(logoPath) && !shouldRefresh) {
            console.log('✓ Logo already exists for today');
            results.logo = { success: true, path: logoPath, skipped: true };
          } else {
            await downloadFile(logoUrl, logoPath);
            results.logo = { success: true, path: logoPath };
          }
        } catch (err) {
          console.error('❌ Logo download failed:', err.message);
          results.logo = { success: false, error: err.message };
        }
      } else {
        console.log('⚠️ No logo URL provided or URL is invalid');
        results.logo = { success: false, error: 'No logo URL provided', skipped: true };
      }

      // Download QR code if URL provided and valid
      if (qrUrl && typeof qrUrl === 'string' && qrUrl.trim()) {
        try {
          const qrPath = path.join(tempDir, 'qr.png');

          // Skip download if file exists and it's the same day
          if (fs.existsSync(qrPath) && !shouldRefresh) {
            console.log('✓ QR code already exists for today');
            results.qr = { success: true, path: qrPath, skipped: true };
          } else {
            await downloadFile(qrUrl, qrPath);
            results.qr = { success: true, path: qrPath };
          }
        } catch (err) {
          console.error('❌ QR download failed:', err.message);
          results.qr = { success: false, error: err.message };
        }
      } else {
        console.log('⚠️ No QR URL provided or URL is invalid');
        results.qr = { success: false, error: 'No QR URL provided', skipped: true };
      }

      // Save download timestamp if at least one succeeded
      if (results.logo?.success || results.qr?.success) {
        saveLastDownloadDate();
      }

      console.log('✅ Asset download complete:', results);

      // Always return success: true even if individual assets failed
      // This allows the login flow to continue
      return {
        success: true,
        results,
        message: 'Asset download process completed (some assets may have failed)'
      };

    } catch (error) {
      console.error('❌ [AssetHandlers] Download failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  /**
   * Check if printer assets exist
   */
  ipcMain.handle('check-printer-assets', async () => {
    try {
      const tempDir = getTempDir();
      const logoPath = path.join(tempDir, 'logo.png');
      const qrPath = path.join(tempDir, 'qr.png');

      return {
        exists: {
          logo: fs.existsSync(logoPath),
          qr: fs.existsSync(qrPath)
        },
        paths: {
          logo: logoPath,
          qr: qrPath
        },
        lastDownload: getLastDownloadDate()
      };
    } catch (error) {
      console.error('Error checking printer assets:', error);
      return {
        exists: { logo: false, qr: false },
        error: error.message
      };
    }
  });

  /**
   * Force delete assets (for testing or manual cleanup)
   */
  ipcMain.handle('delete-printer-assets', async () => {
    try {
      const deleted = deleteOldAssets();
      return {
        success: true,
        deleted
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });
}

module.exports = { registerAssetHandlers };
