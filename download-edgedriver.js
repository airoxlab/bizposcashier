// Simple script to download the correct EdgeDriver version
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function getEdgeVersion() {
  try {
    const regOutput = execSync('reg query "HKEY_CURRENT_USER\\Software\\Microsoft\\Edge\\BLBeacon" /v version 2>nul || reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Edge\\BLBeacon" /v version 2>nul', { encoding: 'utf8' });
    const match = regOutput.match(/version\s+REG_SZ\s+(\d+\.\d+\.\d+\.\d+)/);
    if (match) return match[1];
    throw new Error('Could not find Edge version in registry');
  } catch (error) {
    console.error('Error getting Edge version:', error.message);
    throw error;
  }
}

try {
  const edgeVersion = getEdgeVersion();
  const majorVersion = edgeVersion.split('.')[0];
  console.log(`Detected Microsoft Edge version: ${edgeVersion}`);
  console.log(`Major version: ${majorVersion}`);

  const driverPath = path.join(__dirname, 'electron', 'drivers', 'msedgedriver.exe');
  const zipPath = path.join(__dirname, 'edgedriver.zip');
  const extractPath = path.join(__dirname, 'electron', 'drivers');

  // Ensure drivers directory exists
  if (!fs.existsSync(extractPath)) {
    fs.mkdirSync(extractPath, { recursive: true });
  }

  // Try to download using curl (more reliable than Node's https)
  const urls = [
    `https://msedgewebdriverstorage.blob.core.windows.net/edgewebdriver/${edgeVersion}/edgedriver_win64.zip`,
    `https://msedgewebdriverstorage.blob.core.windows.net/edgewebdriver/${majorVersion}.0.0.0/edgedriver_win64.zip`
  ];

  let downloaded = false;
  for (const url of urls) {
    try {
      console.log(`\nTrying to download from: ${url}`);
      execSync(`curl -L "${url}" -o "${zipPath}"`, { stdio: 'inherit' });

      // Check if file was downloaded
      if (fs.existsSync(zipPath) && fs.statSync(zipPath).size > 1000) {
        console.log('Download successful!');
        downloaded = true;
        break;
      } else {
        console.log('Download failed or file too small');
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      }
    } catch (error) {
      console.log(`Failed: ${error.message}`);
    }
  }

  if (!downloaded) {
    console.error('\n❌ Could not download EdgeDriver automatically.');
    console.error(`\nPlease download manually:`);
    console.error(`1. Go to: https://developer.microsoft.com/en-us/microsoft-edge/tools/webdriver/`);
    console.error(`2. Download version ${majorVersion} (matching your Edge ${edgeVersion})`);
    console.error(`3. Extract msedgedriver.exe to: ${extractPath}`);
    process.exit(1);
  }

  // Extract using PowerShell
  console.log('\nExtracting...');
  try {
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractPath}' -Force"`, { stdio: 'inherit' });
    console.log('Extraction complete!');

    // Cleanup
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
      console.log('Cleaned up zip file.');
    }

    // Verify
    if (fs.existsSync(driverPath)) {
      const version = execSync(`"${driverPath}" --version`, { encoding: 'utf8' });
      console.log(`\n✅ Success! EdgeDriver installed: ${version.trim()}`);
    } else {
      console.error('\n❌ EdgeDriver not found after extraction');
    }
  } catch (error) {
    console.error('Extraction failed:', error.message);
    console.error(`\nPlease extract manually:`);
    console.error(`1. Find the downloaded file: ${zipPath}`);
    console.error(`2. Extract msedgedriver.exe to: ${extractPath}`);
  }

} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
