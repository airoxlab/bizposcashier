// Test receipt printing with logo and QR code
const { ensureAssets } = require('./electron/handlers/onDemandAssetDownload');

const userProfile = {
  store_logo: 'https://gmmjefeojrpazhacqihk.supabase.co/storage/v1/object/public/store-logos/logos/zaidiburair05_gmail_com_1761050528589.png',
  qr_code: 'https://gmmjefeojrpazhacqihk.supabase.co/storage/v1/object/public/store-logos/qr-codes/zaidiburair05_gmail_com_1761154351388.png',
  store_name: 'Cheesy Space',
  store_address: 'Stop No 15,Ward No 14, Kahna Nau, Ferozepur Road, Lahore.',
  phone: '03224907123'
};

async function test() {
  console.log('🧪 Testing receipt printing with assets...\n');

  try {
    // This will download assets if not cached
    const assets = await ensureAssets(
      userProfile.store_logo,
      userProfile.qr_code
    );

    console.log('\n✅ Assets ready for printing:');
    console.log('  Logo:', assets.logo || 'Not available');
    console.log('  QR Code:', assets.qr || 'Not available');
    console.log('  Cached:', assets.cached ? 'Yes' : 'No (just downloaded)');

    console.log('\n📄 Receipt would print with:');
    console.log('  [LOGO IMAGE]');
    console.log('  ' + userProfile.store_name);
    console.log('  ' + userProfile.store_address);
    console.log('  Ph: ' + userProfile.phone);
    console.log('  ... receipt content ...');
    console.log('  [QR CODE IMAGE]');
    console.log('  Thank you for your order!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

test();
