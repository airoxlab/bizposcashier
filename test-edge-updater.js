// Test script to verify the EdgeDriver auto-updater
const path = require('path');
const { ensureEdgeDriverVersion, getEdgeVersion } = require('./electron/whatsapp/edgeDriverManager');

async function test() {
  try {
    console.log('=== Testing EdgeDriver Auto-Updater ===\n');

    // Get Edge version
    const edgeVersion = getEdgeVersion();
    console.log(`✓ Detected Microsoft Edge version: ${edgeVersion}\n`);

    // Test the auto-updater
    const driverPath = path.join(__dirname, 'electron', 'drivers', 'msedgedriver.exe');
    console.log(`Driver path: ${driverPath}\n`);

    console.log('Starting auto-update check...\n');
    await ensureEdgeDriverVersion(driverPath);

    console.log('\n✓ EdgeDriver auto-updater test completed successfully!');
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

test();
