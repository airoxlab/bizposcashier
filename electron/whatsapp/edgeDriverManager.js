const path = require('path');
const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');
const AdmZip = require('adm-zip');

/**
 * Get the installed Microsoft Edge version
 */
function getEdgeVersion() {
  try {
    // Try different methods to get Edge version
    const possiblePaths = [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];

    for (const edgePath of possiblePaths) {
      if (fs.existsSync(edgePath)) {
        try {
          // Get version using wmic
          const version = execSync(`wmic datafile where name="${edgePath.replace(/\\/g, '\\\\')}" get Version /value`, { encoding: 'utf8' });
          const match = version.match(/Version=(\d+\.\d+\.\d+\.\d+)/);
          if (match) {
            return match[1];
          }
        } catch (e) {
          // If wmic fails, try reading version from registry
          try {
            const regOutput = execSync('reg query "HKEY_CURRENT_USER\\Software\\Microsoft\\Edge\\BLBeacon" /v version 2>nul', { encoding: 'utf8' });
            const regMatch = regOutput.match(/version\s+REG_SZ\s+(\d+\.\d+\.\d+\.\d+)/);
            if (regMatch) {
              return regMatch[1];
            }
          } catch (regError) {
            // Try HKLM
            try {
              const regOutput2 = execSync('reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Edge\\BLBeacon" /v version 2>nul', { encoding: 'utf8' });
              const regMatch2 = regOutput2.match(/version\s+REG_SZ\s+(\d+\.\d+\.\d+\.\d+)/);
              if (regMatch2) {
                return regMatch2[1];
              }
            } catch (regError2) {
              // Continue to next path
            }
          }
        }
      }
    }

    throw new Error('Microsoft Edge not found. Please install Microsoft Edge browser.');
  } catch (error) {
    console.error('Error getting Edge version:', error);
    throw new Error('Could not detect Microsoft Edge version: ' + error.message);
  }
}

/**
 * Get the major version number from a full version string
 */
function getMajorVersion(version) {
  return version.split('.')[0];
}

/**
 * Download EdgeDriver for a specific version
 */
async function downloadEdgeDriver(version, driverPath) {
  return new Promise((resolve, reject) => {
    const majorVersion = getMajorVersion(version);

    // Try multiple download URLs in order
    const urls = [
      `https://msedgedriver.azureedge.net/${version}/edgedriver_win64.zip`,
      `https://msedgewebdriverstorage.blob.core.windows.net/edgewebdriver/${version}/edgedriver_win64.zip`,
      `https://msedgedriver.azureedge.net/${majorVersion}.0.0.0/edgedriver_win64.zip`,
      `https://msedgewebdriverstorage.blob.core.windows.net/edgewebdriver/${majorVersion}.0.0.0/edgedriver_win64.zip`
    ];

    let currentUrlIndex = 0;

    function tryDownload() {
      if (currentUrlIndex >= urls.length) {
        reject(new Error(`Failed to download EdgeDriver from all URLs. Please check your internet connection or download manually from https://developer.microsoft.com/en-us/microsoft-edge/tools/webdriver/`));
        return;
      }

      const downloadUrl = urls[currentUrlIndex];
      console.log(`Attempting download from: ${downloadUrl}`);

      const request = https.get(downloadUrl, (response) => {
        // Follow redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          console.log(`Following redirect to: ${response.headers.location}`);
          https.get(response.headers.location, (redirectResponse) => {
            if (redirectResponse.statusCode === 200) {
              processDownload(redirectResponse, driverPath, resolve, reject);
            } else {
              console.log(`Redirect failed with status: ${redirectResponse.statusCode}`);
              currentUrlIndex++;
              tryDownload();
            }
          }).on('error', (err) => {
            console.log(`Redirect error: ${err.message}`);
            currentUrlIndex++;
            tryDownload();
          });
          return;
        }

        if (response.statusCode === 200) {
          processDownload(response, driverPath, resolve, reject);
        } else {
          console.log(`Failed with status ${response.statusCode}, trying next URL...`);
          currentUrlIndex++;
          tryDownload();
        }
      });

      request.on('error', (err) => {
        console.log(`Connection error: ${err.message}, trying next URL...`);
        currentUrlIndex++;
        tryDownload();
      });

      request.setTimeout(30000, () => {
        request.destroy();
        console.log('Download timeout, trying next URL...');
        currentUrlIndex++;
        tryDownload();
      });
    }

    tryDownload();
  });
}

/**
 * Process the downloaded zip file
 */
function processDownload(response, driverPath, resolve, reject) {
  const chunks = [];

  response.on('data', (chunk) => {
    chunks.push(chunk);
  });

  response.on('end', () => {
    try {
      const buffer = Buffer.concat(chunks);
      const zip = new AdmZip(buffer);

      // Extract msedgedriver.exe
      const zipEntries = zip.getEntries();
      const driverEntry = zipEntries.find(entry => entry.entryName.includes('msedgedriver.exe'));

      if (!driverEntry) {
        reject(new Error('msedgedriver.exe not found in downloaded zip'));
        return;
      }

      // Ensure directory exists
      const driverDir = path.dirname(driverPath);
      if (!fs.existsSync(driverDir)) {
        fs.mkdirSync(driverDir, { recursive: true });
      }

      // Extract the driver
      zip.extractEntryTo(driverEntry, driverDir, false, true);

      console.log(`EdgeDriver extracted to ${driverPath}`);
      resolve(driverPath);
    } catch (error) {
      reject(new Error('Failed to extract EdgeDriver: ' + error.message));
    }
  });
}

/**
 * Get the version of an existing EdgeDriver
 */
function getDriverVersion(driverPath) {
  try {
    if (!fs.existsSync(driverPath)) {
      return null;
    }

    const output = execSync(`"${driverPath}" --version`, { encoding: 'utf8' });
    const match = output.match(/Microsoft Edge WebDriver (\d+\.\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Error getting driver version:', error);
    return null;
  }
}

/**
 * Check if EdgeDriver needs to be updated and update if necessary
 */
async function ensureEdgeDriverVersion(driverPath) {
  try {
    console.log('Checking EdgeDriver version...');

    // Get installed Edge version
    const edgeVersion = getEdgeVersion();
    const edgeMajorVersion = getMajorVersion(edgeVersion);
    console.log(`Microsoft Edge version: ${edgeVersion} (major: ${edgeMajorVersion})`);

    // Get current driver version
    const currentDriverVersion = getDriverVersion(driverPath);

    if (currentDriverVersion) {
      const driverMajorVersion = getMajorVersion(currentDriverVersion);
      console.log(`Current EdgeDriver version: ${currentDriverVersion} (major: ${driverMajorVersion})`);

      // Check if major versions match
      if (driverMajorVersion === edgeMajorVersion) {
        console.log('EdgeDriver version is compatible. No update needed.');
        return driverPath;
      }

      console.log('EdgeDriver version mismatch detected. Updating...');
    } else {
      console.log('EdgeDriver not found. Downloading...');
    }

    // Download the correct version
    await downloadEdgeDriver(edgeVersion, driverPath);

    // Verify the new driver
    const newDriverVersion = getDriverVersion(driverPath);
    console.log(`EdgeDriver updated to version: ${newDriverVersion}`);

    return driverPath;
  } catch (error) {
    console.error('Error ensuring EdgeDriver version:', error);
    throw error;
  }
}

module.exports = {
  ensureEdgeDriverVersion,
  getEdgeVersion,
  getMajorVersion
};
