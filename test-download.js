// Test script to download logo and QR code manually
const https = require('https');
const fs = require('fs');
const path = require('path');

// Your actual URLs from the user object
const LOGO_URL = 'https://gmmjefeojrpazhacqihk.supabase.co/storage/v1/object/public/store-logos/logos/zaidiburair05_gmail_com_1761050528589.png';
const QR_URL = 'https://gmmjefeojrpazhacqihk.supabase.co/storage/v1/object/public/store-logos/qr-codes/zaidiburair05_gmail_com_1761154351388.png';

// Temp directory
const TEMP_DIR = path.join(__dirname, 'electron', 'printing', 'temp');

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  console.log('✅ Created temp directory');
}

// Download function
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`\n📡 Downloading from: ${url}`);
    console.log(`📁 Saving to: ${destPath}`);

    const file = fs.createWriteStream(destPath);

    https.get(url, (response) => {
      console.log(`📊 Status: ${response.statusCode}`);

      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        console.log(`↪️ Redirecting to: ${response.headers.location}`);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`HTTP ${response.statusCode}`));
      }

      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        process.stdout.write(`\r⏳ Downloaded: ${(bytes / 1024).toFixed(2)} KB`);
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        console.log(`\n✅ Downloaded: ${path.basename(destPath)} (${bytes} bytes)`);
        resolve(destPath);
      });

      file.on('error', (err) => {
        file.close();
        fs.unlinkSync(destPath);
        reject(err);
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      reject(err);
    });
  });
}

// Run downloads
async function main() {
  console.log('🚀 Starting asset download test...\n');

  try {
    // Download logo
    await downloadFile(LOGO_URL, path.join(TEMP_DIR, 'logo.png'));

    // Download QR code
    await downloadFile(QR_URL, path.join(TEMP_DIR, 'qr.png'));

    console.log('\n✅ All assets downloaded successfully!');
    console.log('\nFiles in temp directory:');
    const files = fs.readdirSync(TEMP_DIR);
    files.forEach(file => {
      const filePath = path.join(TEMP_DIR, file);
      const stats = fs.statSync(filePath);
      console.log(`  - ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
    });

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
