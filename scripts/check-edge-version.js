/**
 * Edge Version Diagnostic Tool
 * Checks Microsoft Edge and EdgeDriver versions for compatibility
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('='.repeat(60));
console.log('Microsoft Edge Version Diagnostic Tool');
console.log('='.repeat(60));
console.log('');

// Check Microsoft Edge version
console.log('1. Checking Microsoft Edge browser version...');
try {
  const regOutput = execSync(
    'reg query "HKEY_CURRENT_USER\\Software\\Microsoft\\Edge\\BLBeacon" /v version 2>nul || reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Edge\\BLBeacon" /v version 2>nul',
    { encoding: 'utf8' }
  );
  const match = regOutput.match(/version\s+REG_SZ\s+(\d+\.\d+\.\d+\.\d+)/);

  if (match) {
    const edgeVersion = match[1];
    const majorVersion = edgeVersion.split('.')[0];
    console.log(`   ✅ Microsoft Edge: v${edgeVersion}`);
    console.log(`   ✅ Major Version: ${majorVersion}`);
  } else {
    console.log('   ❌ Could not detect Edge version from registry');
  }
} catch (error) {
  console.log('   ❌ Microsoft Edge not found or not accessible');
  console.log('   💡 Please ensure Microsoft Edge is installed');
}

console.log('');

// Check EdgeDriver in development folder
console.log('2. Checking EdgeDriver (Development)...');
const devDriverPath = path.join(__dirname, '..', 'electron', 'drivers', 'msedgedriver.exe');
if (fs.existsSync(devDriverPath)) {
  try {
    const driverVersion = execSync(`"${devDriverPath}" --version`, { encoding: 'utf8' });
    const match = driverVersion.match(/Microsoft Edge WebDriver (\d+\.\d+\.\d+\.\d+)/);
    if (match) {
      const version = match[1];
      const majorVersion = version.split('.')[0];
      console.log(`   ✅ EdgeDriver: v${version}`);
      console.log(`   ✅ Major Version: ${majorVersion}`);
      console.log(`   📁 Path: ${devDriverPath}`);
    }
  } catch (error) {
    console.log(`   ❌ EdgeDriver exists but failed to execute`);
    console.log(`   💡 Driver might be corrupted or incompatible`);
  }
} else {
  console.log('   ℹ️  EdgeDriver not found in development folder');
  console.log(`   📁 Expected path: ${devDriverPath}`);
}

console.log('');

// Check if versions match
console.log('3. Compatibility Check...');
try {
  const regOutput = execSync(
    'reg query "HKEY_CURRENT_USER\\Software\\Microsoft\\Edge\\BLBeacon" /v version 2>nul || reg query "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Edge\\BLBeacon" /v version 2>nul',
    { encoding: 'utf8' }
  );
  const edgeMatch = regOutput.match(/version\s+REG_SZ\s+(\d+\.\d+\.\d+\.\d+)/);

  if (edgeMatch && fs.existsSync(devDriverPath)) {
    const edgeMajor = edgeMatch[1].split('.')[0];
    const driverVersion = execSync(`"${devDriverPath}" --version`, { encoding: 'utf8' });
    const driverMatch = driverVersion.match(/Microsoft Edge WebDriver (\d+\.\d+\.\d+\.\d+)/);

    if (driverMatch) {
      const driverMajor = driverMatch[1].split('.')[0];

      if (edgeMajor === driverMajor) {
        console.log('   ✅ COMPATIBLE - Major versions match!');
        console.log(`   ✅ Both are version ${edgeMajor}.x.x.x`);
      } else {
        console.log('   ❌ VERSION MISMATCH DETECTED!');
        console.log(`   ❌ Edge: ${edgeMajor}.x.x.x`);
        console.log(`   ❌ Driver: ${driverMajor}.x.x.x`);
        console.log('');
        console.log('   💡 Solution:');
        console.log('   Run: npm run update-edgedriver');
        console.log('   Or the app will auto-update EdgeDriver on next WhatsApp connection');
      }
    }
  }
} catch (error) {
  console.log('   ℹ️  Could not perform compatibility check');
}

console.log('');
console.log('='.repeat(60));
console.log('Diagnostic Complete');
console.log('='.repeat(60));
console.log('');
console.log('💡 Tips:');
console.log('   - EdgeDriver major version must match Edge browser major version');
console.log('   - Run "npm run update-edgedriver" to download the correct version');
console.log('   - The app will auto-update EdgeDriver when you connect WhatsApp');
console.log('   - EdgeDriver is stored in user data folder in production builds');
console.log('');
