const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { ensureAssets } = require('../handlers/onDemandAssetDownload');

// ESC/POS Commands
const ESC = 0x1B;
const GS = 0x1D;
const LF = 0x0A;

// Command builders
const CMD = {
  INIT: Buffer.from([ESC, 0x40]),
  ALIGN_LEFT: Buffer.from([ESC, 0x61, 0x00]),
  ALIGN_CENTER: Buffer.from([ESC, 0x61, 0x01]),
  ALIGN_RIGHT: Buffer.from([ESC, 0x61, 0x02]),
  BOLD_ON: Buffer.from([ESC, 0x45, 0x01]),
  BOLD_OFF: Buffer.from([ESC, 0x45, 0x00]),
  DOUBLE_ON: Buffer.from([GS, 0x21, 0x11]),
  DOUBLE_OFF: Buffer.from([GS, 0x21, 0x00]),
  DOUBLE_HEIGHT: Buffer.from([GS, 0x21, 0x01]),
  DOUBLE_WIDTH: Buffer.from([GS, 0x21, 0x10]),
  NORMAL: Buffer.from([GS, 0x21, 0x00]),
  CUT: Buffer.from([GS, 0x56, 0x41, 0x00]),
  FEED: Buffer.from([LF])
};

// ========================================
// PAPER WIDTH CONFIGURATION
// 72mm thermal printer = 42 characters
// ========================================
const PAPER_WIDTH = 42;

// Helper: Text to buffer
function text(str) {
  return Buffer.from(str, 'utf8');
}

// Helper: Draw separator line
function drawLine(char = '-') {
  return text(char.repeat(PAPER_WIDTH) + '\n');
}

// Helper: Left-right aligned text
function leftRight(left, right) {
  const maxLeft = PAPER_WIDTH - right.length - 1;
  const leftTruncated = left.length > maxLeft ? left.substring(0, maxLeft) : left;
  const spaces = PAPER_WIDTH - leftTruncated.length - right.length;
  return text(leftTruncated + ' '.repeat(Math.max(1, spaces)) + right + '\n');
}

// Helper: Left aligned text
function leftText(str) {
  if (str.length > PAPER_WIDTH) {
    return text(str.substring(0, PAPER_WIDTH) + '\n');
  }
  return text(str + '\n');
}

// Helper: Wrap long text across multiple lines
function wrapText(str, indent = 0) {
  const buffers = [];
  const indentStr = ' '.repeat(indent);
  const words = str.split(' ');
  let line = indentStr;

  for (const word of words) {
    if ((line + word).length > PAPER_WIDTH) {
      buffers.push(text(line.trimEnd() + '\n'));
      line = indentStr + word + ' ';
    } else {
      line += word + ' ';
    }
  }

  if (line.trim()) {
    buffers.push(text(line.trimEnd() + '\n'));
  }

  return Buffer.concat(buffers);
}

// Helper: Convert image to ESC/POS bitmap format using Jimp
async function imageToEscPos(imagePath, maxWidth = 384) {
  try {
    // Jimp v1.x uses named imports
    const { Jimp } = require('jimp');
    const image = await Jimp.read(imagePath);

    // Resize if needed (maintain aspect ratio)
    if (image.bitmap.width > maxWidth) {
      image.resize({ w: maxWidth });
    }

    // Convert to grayscale - Jimp v1.x uses greyscale (British spelling) and doesn't return promise
    image.greyscale();

    const width = image.bitmap.width;
    const height = image.bitmap.height;

    // Width must be divisible by 8 for ESC/POS
    const printWidth = Math.ceil(width / 8) * 8;
    const bytesPerLine = printWidth / 8;

    const commands = [];

    // GS v 0 command for raster bit image
    commands.push(Buffer.from([
      GS, 0x76, 0x30, 0x00,
      bytesPerLine & 0xFF,
      (bytesPerLine >> 8) & 0xFF,
      height & 0xFF,
      (height >> 8) & 0xFF
    ]));

    // Convert image data to bitmap
    const bitmapData = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < printWidth; x += 8) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const pixelX = x + bit;
          if (pixelX < width) {
            const idx = (y * width + pixelX) * 4;
            const pixel = image.bitmap.data[idx]; // Red channel (grayscale value)
            const alpha = image.bitmap.data[idx + 3]; // Alpha channel

            // Only print pixel if it's opaque (alpha > 127) AND dark (pixel < 128)
            // Transparent pixels (alpha < 128) are treated as white (not printed)
            if (alpha > 127 && pixel < 128) {
              byte |= (0x80 >> bit);
            }
          }
        }
        bitmapData.push(byte);
      }
    }

    commands.push(Buffer.from(bitmapData));
    return Buffer.concat(commands);
  } catch (error) {
    console.error('Image conversion error:', error.message);
    return null;
  }
}

// Generate receipt ESC/POS commands - MATCHING IP PRINTER LAYOUT
async function generateReceiptESCPOS(orderData, userProfile, assets) {
  console.log('📄 [usbPrinter.js] Generating CUSTOMER RECEIPT via USB');
  const commands = [];

  // Initialize printer
  commands.push(CMD.INIT);

  // Check if logo printing is enabled (default true)
  const showLogoOnReceipt = userProfile?.show_logo_on_receipt !== false;

  // ========================================
  // LOGO (if available and enabled)
  // ========================================
  if (showLogoOnReceipt && assets && assets.logo && fs.existsSync(assets.logo)) {
    try {
      commands.push(CMD.ALIGN_CENTER);
      // Maximum logo width for thermal printers (576px for 80mm paper)
      const logoData = await imageToEscPos(assets.logo, 576);
      if (logoData) {
        commands.push(logoData);
        // Add spacing after logo (2 feed lines for visual separation)
        commands.push(CMD.FEED);
        commands.push(CMD.FEED);
      }
    } catch (e) {
      console.error('[usbPrinter.js] Logo error:', e.message);
    }
  }

  // ========================================
  // STORE HEADER
  // ========================================
  const storeName = (userProfile?.store_name || 'POS SYSTEM').toUpperCase();
  const storeAddress = userProfile?.store_address || '';
  const storePhone = userProfile?.phone || '';

  // Check if business name should be shown (default true)
  const showBusinessNameOnReceipt = userProfile?.show_business_name_on_receipt !== false;

  // Store name - Bold + Double size + Centered (only if enabled)
  if (showBusinessNameOnReceipt) {
    commands.push(CMD.ALIGN_CENTER);
    commands.push(CMD.BOLD_ON);
    commands.push(CMD.DOUBLE_ON);
    commands.push(text(storeName + '\n'));
    commands.push(CMD.DOUBLE_OFF);
    commands.push(CMD.BOLD_OFF);
    commands.push(CMD.FEED);
  }

  // Store address and phone
  if (storeAddress) {
    commands.push(CMD.ALIGN_CENTER);
    commands.push(text(storeAddress + '\n'));
  }
  if (storePhone) {
    commands.push(CMD.ALIGN_CENTER);
    commands.push(text(`Ph: ${storePhone}\n`));
  }

  // ========================================
  // ORDER RECEIPT HEADER (BOLD)
  // ========================================
  commands.push(CMD.ALIGN_CENTER);
  commands.push(drawLine('-'));
  commands.push(CMD.BOLD_ON);
  commands.push(text('ORDER RECEIPT\n'));
  commands.push(CMD.BOLD_OFF);
  commands.push(drawLine('-'));

  // ========================================
  // ORDER DETAILS
  // ========================================
  commands.push(CMD.ALIGN_CENTER);

  const orderNumber = orderData.orderNumber || 'N/A';
  const formattedSerialReceipt = orderData.dailySerial
    ? `#${String(orderData.dailySerial).padStart(3, '0')}`
    : null;
  const orderDate = new Date();
  const dateStr = orderDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = orderDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  commands.push(leftRight('Invoice:', `#${orderNumber}`));
  if (formattedSerialReceipt) {
    commands.push(leftRight('Token #:', formattedSerialReceipt));
  }
  commands.push(leftRight('Date:', dateStr));
  commands.push(leftRight('Time:', timeStr));

  if (orderData.orderType) {
    commands.push(leftRight('Type:', orderData.orderType.toUpperCase()));
  }

  if (orderData.tableName) {
    commands.push(leftRight('Table:', String(orderData.tableName)));
  }

  // Cashier name (admin's customer_name or cashier's name)
  const cashierName = userProfile?.cashier_name || userProfile?.customer_name || 'N/A';
  commands.push(leftRight('Cashier:', cashierName));

  // ========================================
  // CUSTOMER INFO
  // ========================================
  if (orderData.customer) {
    const customerName = orderData.customer.full_name || 'Guest';
    commands.push(leftRight('Customer:', customerName));

    if (orderData.customer.phone) {
      commands.push(leftRight('Phone:', orderData.customer.phone));
    }

    if (orderData.orderType === 'delivery') {
      const address = orderData.deliveryAddress || orderData.customer?.addressline || orderData.customer?.address;
      if (address) {
        commands.push(leftText('Address:'));
        const words = address.split(' ');
        let line = '  ';
        for (const word of words) {
          if ((line + word).length > PAPER_WIDTH - 2) {
            commands.push(leftText(line));
            line = '  ' + word + ' ';
          } else {
            line += word + ' ';
          }
        }
        if (line.trim()) {
          commands.push(leftText(line));
        }
      }
    }
  }

  // ========================================
  // ITEMS SECTION (BOLD HEADERS)
  // ========================================
  commands.push(drawLine('-'));
  commands.push(CMD.ALIGN_CENTER);
  commands.push(CMD.BOLD_ON);
  commands.push(text('ITEMS\n'));
  commands.push(CMD.BOLD_OFF);
  commands.push(drawLine('-'));
  commands.push(CMD.BOLD_ON);
  commands.push(leftRight('ITEM', 'AMOUNT'));
  commands.push(CMD.BOLD_OFF);
  commands.push(drawLine('-'));

  if (orderData.cart && orderData.cart.length > 0) {
    for (const item of orderData.cart) {

      if (item.isDeal) {
        const dealName = `${item.quantity}x ${item.dealName}`;
        const price = `Rs ${item.totalPrice.toFixed(0)}`;
        commands.push(leftRight(dealName, price));

        if (item.dealProducts && item.dealProducts.length > 0) {
          commands.push(CMD.ALIGN_LEFT);
          for (const product of item.dealProducts) {
            let productLine = `  - ${product.quantity}x ${product.name}`;
            // Check for variant or flavor
            const variantName = product.variant ||
              (product.flavor ?
                (typeof product.flavor === 'object' ? (product.flavor.flavor_name || product.flavor.name) : product.flavor)
                : null);
            if (variantName) {
              productLine += ` - ${variantName}`;
            }
            commands.push(leftText(productLine));
          }
        }
      } else {
        let itemName = `${item.quantity}x ${item.productName}`;
        if (item.variantName) itemName += ` (${item.variantName})`;
        const price = `Rs ${item.totalPrice.toFixed(0)}`;
        commands.push(leftRight(itemName, price));
      }
    }
  }
  commands.push(drawLine('-'));

  // ========================================
  // TOTALS SECTION (NO LINE ABOVE SUBTOTAL)
  // ========================================
  const subtotal = parseFloat(orderData.subtotal || 0);
  const deliveryCharges = parseFloat(orderData.deliveryCharges || 0);
  const discountAmount = parseFloat(orderData.discountAmount || 0); // Smart discount only
  const loyaltyDiscountAmount = parseFloat(orderData.loyaltyDiscountAmount || 0);
  const loyaltyPointsRedeemed = parseInt(orderData.loyaltyPointsRedeemed || 0);

  // Calculate grand total with both discounts applied
  const totalDiscounts = discountAmount + loyaltyDiscountAmount;
  const grandTotal = subtotal - totalDiscounts + deliveryCharges;

  commands.push(leftRight('Subtotal:', `Rs ${subtotal.toFixed(0)}`));

  // Show smart discount if applicable
  if (discountAmount > 0) {
    const discountText = orderData.discountType === 'percentage'
      ? `Discount (${orderData.discountValue}%):`
      : 'Discount:';
    commands.push(leftRight(discountText, `-Rs ${discountAmount.toFixed(0)}`));
  }

  // Show loyalty discount separately
  if (loyaltyDiscountAmount > 0) {
    const loyaltyText = loyaltyPointsRedeemed > 0
      ? `Loyalty (${loyaltyPointsRedeemed} pts):`
      : 'Loyalty Discount:';
    commands.push(leftRight(loyaltyText, `-Rs ${loyaltyDiscountAmount.toFixed(0)}`));
  }

  if (orderData.orderType === 'delivery' && deliveryCharges > 0) {
    commands.push(leftRight('Delivery Charges:', `Rs ${deliveryCharges.toFixed(0)}`));
  }

  // commands.push(drawLine('-'));
  commands.push(CMD.BOLD_ON);
  commands.push(leftRight('GRAND TOTAL', `Rs ${grandTotal.toFixed(0)}`));
  commands.push(CMD.BOLD_OFF);
  commands.push(drawLine('-'));

  // ========================================
  // PAYMENT SECTION
  // ========================================
  if (orderData.paymentMethod) {
    commands.push(CMD.ALIGN_CENTER);

    if (orderData.paymentMethod.toLowerCase() === 'unpaid') {
      commands.push(CMD.BOLD_ON);
      commands.push(CMD.DOUBLE_ON);
      commands.push(text('* UNPAID *\n'));
      commands.push(CMD.DOUBLE_OFF);
      commands.push(CMD.BOLD_OFF);
    } else if (orderData.paymentMethod === 'Split' && orderData.paymentTransactions && orderData.paymentTransactions.length > 0) {
      // Handle Split Payment - show breakdown
      commands.push(CMD.BOLD_ON);
      commands.push(text('PAID via SPLIT PAYMENT\n'));
      commands.push(CMD.BOLD_OFF);
      commands.push(text('\n'));

      // Show each payment method breakdown
      for (const transaction of orderData.paymentTransactions) {
        commands.push(leftRight(
          `${transaction.payment_method}:`,
          `Rs ${parseFloat(transaction.amount).toFixed(0)}`
        ));
      }
      commands.push(text('\n'));
    } else {
      commands.push(CMD.BOLD_ON);
      commands.push(text(`PAID via ${orderData.paymentMethod.toUpperCase()}\n`));
      commands.push(CMD.BOLD_OFF);

      if (orderData.paymentMethod === 'Cash' && orderData.cashReceived) {
        commands.push(leftRight('Cash Received:', `Rs ${orderData.cashReceived.toFixed(0)}`));
        if (orderData.changeAmount && orderData.changeAmount > 0) {
          commands.push(leftRight('Change:', `Rs ${orderData.changeAmount.toFixed(0)}`));
        }
      }
    }
  }

  commands.push(drawLine('-'));

  // ========================================
  // FOOTER SECTION (Optional)
  // ========================================
  const showFooterSection = userProfile?.show_footer_section !== false;

  if (showFooterSection) {
    // QR Code (if available)
    if (assets && assets.qr && fs.existsSync(assets.qr)) {
      try {
        commands.push(CMD.ALIGN_CENTER);
        const qrData = await imageToEscPos(assets.qr, 200);
        if (qrData) {
          commands.push(qrData);
        }
      } catch (e) {
        console.error('QR processing error:', e.message);
      }
    }

    // Review message
    commands.push(CMD.ALIGN_CENTER);
    commands.push(text('Drop a review & flex on us!\n'));
    commands.push(text('Your feedback = our glow up\n'));

    // Hashtags
    const hashtag1 = userProfile?.hashtag1 || '';
    const hashtag2 = userProfile?.hashtag2 || '';
    if (hashtag1 || hashtag2) {
      const hashtagLine = [hashtag1, hashtag2].filter(Boolean).join(' ');
      commands.push(CMD.BOLD_ON);
      commands.push(text(hashtagLine + '\n'));
      commands.push(CMD.BOLD_OFF);
    }
  }

  // ========================================
  // POWERED BY & CUT
  // ========================================
  commands.push(CMD.FEED);
  commands.push(CMD.ALIGN_CENTER);
  commands.push(text('Powered by airoxlab.com\n'));

  commands.push(CMD.FEED);
  commands.push(CMD.CUT);

  return Buffer.concat(commands);
}

// Generate kitchen token ESC/POS commands
async function generateKitchenTokenESCPOS(orderData, userProfile) {
  console.log('🍳 [usbPrinter.js] Generating KITCHEN TOKEN via USB');
  const commands = [];

  commands.push(CMD.INIT);

  // ========================================
  // HEADER SECTION
  // ========================================
  commands.push(CMD.ALIGN_CENTER);
  commands.push(CMD.BOLD_ON);
  commands.push(CMD.DOUBLE_HEIGHT);
  commands.push(text('KITCHEN TOKEN\n'));
  commands.push(CMD.NORMAL);
  commands.push(CMD.BOLD_OFF);

  commands.push(CMD.ALIGN_CENTER);
  commands.push(drawLine('-'));

  // ========================================
  // ORDER INFO - Left-Right aligned
  // ========================================
  commands.push(CMD.ALIGN_CENTER);
  
  const orderNumber = orderData.orderNumber || 'N/A';
  const formattedSerial = orderData.dailySerial
    ? `#${String(orderData.dailySerial).padStart(3, '0')}`
    : null;
  const orderDate = new Date();
  const formattedDate = orderDate.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const formattedTime = orderDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  const orderType = orderData.orderType ? orderData.orderType.toUpperCase() : 'WALKIN';

  commands.push(CMD.BOLD_ON);
  if (formattedSerial) {
    commands.push(leftRight('Token #', formattedSerial));
    commands.push(CMD.BOLD_OFF);
    commands.push(leftRight('Ref:', orderNumber));
  } else {
    commands.push(leftRight('Token #', orderNumber));
    commands.push(CMD.BOLD_OFF);
  }
  commands.push(leftRight('Date:', formattedDate));
  commands.push(leftRight('Time:', formattedTime));
  commands.push(leftRight('Type:', orderType));

  // Cashier name (admin's customer_name or cashier's name)
  const cashierName = userProfile?.cashier_name || userProfile?.customer_name || 'N/A';
  commands.push(leftRight('Cashier:', cashierName));

  commands.push(drawLine('-'));

  // ========================================
  // ITEMS SECTION
  // ========================================
  commands.push(CMD.ALIGN_CENTER);
  commands.push(CMD.BOLD_ON);
  commands.push(text('ITEMS\n'));
  commands.push(CMD.BOLD_OFF);
  commands.push(drawLine('-'));

  commands.push(leftRight('Item Name', 'Qty'));
  commands.push(drawLine('-'));

  if (orderData.items && orderData.items.length > 0) {
    for (const item of orderData.items) {
      const ct = item.changeType;

      if (item.isDeal) {
        let itemName = item.name;
        const maxNameLength = PAPER_WIDTH - 4;
        if (itemName.length > maxNameLength) itemName = itemName.substring(0, maxNameLength);

        commands.push(CMD.ALIGN_LEFT);
        if (ct === 'modified') {
          commands.push(leftRight(itemName, `Before: ${item.oldQuantity}`));
          commands.push(leftRight('', `After:  ${item.newQuantity}`));
        } else if (ct === 'added') {
          commands.push(leftRight(`+ ${itemName}`, item.quantity.toString()));
        } else if (ct === 'removed') {
          commands.push(leftRight(`- ${itemName}`, item.quantity.toString()));
        } else {
          commands.push(leftRight(itemName, item.quantity.toString()));
        }

        if (item.dealProducts && item.dealProducts.length > 0) {
          commands.push(CMD.ALIGN_LEFT);
          for (const product of item.dealProducts) {
            const variantName = product.variant ||
              (product.flavor ?
                (typeof product.flavor === 'object' ? (product.flavor.flavor_name || product.flavor.name) : product.flavor)
                : null);
            let productLine = `  ${product.quantity}x ${product.name}`;
            if (variantName) productLine += ` - ${variantName}`;
            commands.push(leftText(productLine));
          }
        }
        if (item.instructions) {
          commands.push(leftText(`  * ${item.instructions}`));
        }
      } else {
        let itemName = item.name;
        if (item.size) itemName = `${item.name} (${item.size})`;
        const maxNameLength = PAPER_WIDTH - 4;
        if (itemName.length > maxNameLength) itemName = itemName.substring(0, maxNameLength);

        commands.push(CMD.ALIGN_LEFT);
        if (ct === 'modified') {
          commands.push(leftRight(itemName, `Before: ${item.oldQuantity}`));
          commands.push(leftRight('', `After:  ${item.newQuantity}`));
        } else if (ct === 'added') {
          commands.push(leftRight(`+ ${itemName}`, item.quantity.toString()));
        } else if (ct === 'removed') {
          commands.push(leftRight(`- ${itemName}`, item.quantity.toString()));
        } else {
          commands.push(leftRight(itemName, item.quantity.toString()));
        }
        if (item.instructions) {
          commands.push(leftText(`  * ${item.instructions}`));
        }
      }
    }
  } else {
    commands.push(CMD.ALIGN_CENTER);
    commands.push(text('No items\n'));
  }

  commands.push(drawLine('-'));

  // ========================================
  // SPECIAL NOTES
  // ========================================
  if (orderData.specialNotes || orderData.notes) {
    commands.push(CMD.BOLD_ON);
    commands.push(leftText('SPECIAL NOTES:'));
    commands.push(CMD.BOLD_OFF);
    commands.push(wrapText(orderData.specialNotes || orderData.notes, 0));
    commands.push(drawLine('-'));
  }

  // ========================================
  // PRIORITY INDICATOR
  // ========================================
  if (orderData.orderType === 'delivery') {
    commands.push(CMD.ALIGN_CENTER);
    commands.push(CMD.BOLD_ON);
    commands.push(CMD.DOUBLE_HEIGHT);
    commands.push(text('DELIVERY\n'));
    commands.push(CMD.NORMAL);
    commands.push(CMD.BOLD_OFF);
    commands.push(CMD.ALIGN_CENTER);
    commands.push(drawLine('-'));
    const deliveryAddr = orderData.deliveryAddress || orderData.customerAddress;
    if (deliveryAddr) {
      commands.push(CMD.ALIGN_LEFT);
      commands.push(CMD.BOLD_ON);
      commands.push(leftText('Address:'));
      commands.push(CMD.BOLD_OFF);
      commands.push(wrapText(deliveryAddr, 2));
      commands.push(drawLine('-'));
    }
  } else if (orderData.orderType === 'takeaway') {
    commands.push(CMD.ALIGN_CENTER);
    commands.push(CMD.BOLD_ON);
    commands.push(CMD.DOUBLE_HEIGHT);
    commands.push(text('TAKEAWAY\n'));
    commands.push(CMD.NORMAL);
    commands.push(CMD.BOLD_OFF);
    commands.push(CMD.ALIGN_CENTER);
    commands.push(drawLine('-'));
  } else if (orderData.orderType === 'walkin' && orderData.tableName) {
    commands.push(CMD.ALIGN_CENTER);
    commands.push(CMD.BOLD_ON);
    commands.push(CMD.DOUBLE_HEIGHT);
    commands.push(text(`${orderData.tableName}\n`));
    commands.push(CMD.NORMAL);
    commands.push(CMD.BOLD_OFF);
    commands.push(CMD.ALIGN_CENTER);
    commands.push(drawLine('-'));
  }

  // ========================================
  // FOOTER & CUT
  // ========================================
  commands.push(CMD.ALIGN_CENTER);
  commands.push(text('Powered by airoxlab.com\n'));

  commands.push(CMD.FEED);
  commands.push(CMD.CUT);

  return Buffer.concat(commands);
}

// List all Windows printers via PowerShell
function listWindowsPrinters() {
  return new Promise((resolve) => {
    try {
      if (process.platform !== 'win32') {
        return resolve({ success: false, printers: [], error: 'Windows only' });
      }
      const result = execSync(
        'powershell -Command "Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json"',
        { encoding: 'utf8', timeout: 10000 }
      );
      const parsed = JSON.parse(result.trim());
      const names = Array.isArray(parsed) ? parsed : [parsed];
      resolve({ success: true, printers: names.map(name => ({ name, type: 'windows' })) });
    } catch (error) {
      resolve({ success: false, printers: [], error: error.message });
    }
  });
}

// Send raw ESC/POS data to a Windows USB Printer Class printer by name
// Uses PowerShell Win32 spooler API - works with USB001 / USB Printer Class devices
async function sendToWindowsPrinter(printerName, data) {
  return new Promise((resolve, reject) => {
    try {
      if (process.platform !== 'win32') {
        throw new Error('Windows USB printing is only supported on Windows');
      }

      const tempDir = path.join(os.tmpdir(), 'pos-receipts');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const ts = Date.now();
      const receiptFile = path.join(tempDir, `receipt_${ts}.prn`);
      const psFile = path.join(tempDir, `print_${ts}.ps1`);

      fs.writeFileSync(receiptFile, data);

      // Escape single quotes in names for PowerShell
      const safePrinter = printerName.replace(/'/g, "''");
      const safeFile = receiptFile.replace(/\\/g, '\\\\').replace(/'/g, "''");

      const psScript = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
}

public class RawPrinter {
    [DllImport("winspool.drv", EntryPoint="OpenPrinterA", CharSet=CharSet.Ansi, SetLastError=true)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint="StartDocPrinterA", CharSet=CharSet.Ansi, SetLastError=true)]
    public static extern int StartDocPrinter(IntPtr hPrinter, int Level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBuf, int cbBuf, out int pcWritten);
}
'@ -ErrorAction Stop

$printerName = '${safePrinter}'
$fileName = '${safeFile}'
$hPrinter = [IntPtr]::Zero

if (-not [RawPrinter]::OpenPrinter($printerName, [ref]$hPrinter, [IntPtr]::Zero)) {
    $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "Cannot open printer '$printerName' (Win32 error $err). Check the printer name in Windows Devices & Printers."
}

try {
    $di = New-Object DOCINFOA
    $di.pDocName = "POS Receipt"
    $di.pDataType = "RAW"
    $di.pOutputFile = $null

    $docId = [RawPrinter]::StartDocPrinter($hPrinter, 1, $di)
    if ($docId -le 0) {
        $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        throw "StartDocPrinter failed (Win32 error $err) - try changing the printer driver to Generic/Text Only"
    }

    [RawPrinter]::StartPagePrinter($hPrinter) | Out-Null

    $bytes = [System.IO.File]::ReadAllBytes($fileName)
    $ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
    [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
    $written = 0
    if (-not [RawPrinter]::WritePrinter($hPrinter, $ptr, $bytes.Length, [ref]$written)) {
        $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        [System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
        throw "WritePrinter failed (Win32 error $err)"
    }
    [System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)

    [RawPrinter]::EndPagePrinter($hPrinter) | Out-Null
    [RawPrinter]::EndDocPrinter($hPrinter) | Out-Null
} finally {
    [RawPrinter]::ClosePrinter($hPrinter) | Out-Null
}
Write-Output "OK"
`;

      fs.writeFileSync(psFile, psScript, 'utf8');

      console.log(`🖨️ [usbPrinter.js] Sending to Windows printer: "${printerName}"`);
      execSync(`powershell -ExecutionPolicy Bypass -File "${psFile}"`, {
        encoding: 'utf8',
        timeout: 30000
      });

      try { fs.unlinkSync(receiptFile); } catch (e) { /* ignore */ }
      try { fs.unlinkSync(psFile); } catch (e) { /* ignore */ }

      console.log('✅ Windows USB print completed successfully');
      resolve({ success: true });
    } catch (error) {
      let msg = error.message;
      if (msg.includes('Cannot open printer') || msg.includes('not found')) {
        msg = `Printer "${printerName}" not found. Open Windows "Devices & Printers" and check the exact printer name.`;
      } else if (msg.includes('Access is denied') || msg.includes('access denied')) {
        msg = `Access denied to printer "${printerName}". Try running the app as Administrator.`;
      }
      reject(new Error(msg));
    }
  });
}

// Send data to USB port
async function sendToUSBPort(port, data) {
  return new Promise((resolve, reject) => {
    try {
      // Validate port format
      if (!port || typeof port !== 'string') {
        throw new Error('Invalid USB port: port is empty or not a string');
      }

      // Normalize port format for Windows (e.g., COM3, COM4)
      let normalizedPort = port.trim().toUpperCase();
      if (process.platform === 'win32' && !normalizedPort.startsWith('COM') && !normalizedPort.startsWith('\\\\.\\')) {
        // Try to extract COM port number if it's in a different format
        const comMatch = normalizedPort.match(/COM\d+/i);
        if (comMatch) {
          normalizedPort = comMatch[0].toUpperCase();
        }
      }

      console.log(`📍 USB Port: "${port}" -> Normalized: "${normalizedPort}"`);

      // Use os.tmpdir() instead of process.env.TEMP for reliable cross-platform temp directory
      const tempDir = path.join(os.tmpdir(), 'pos-receipts');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const receiptFile = path.join(tempDir, `receipt_${Date.now()}.prn`);
      fs.writeFileSync(receiptFile, data);

      console.log(`📄 Receipt file created: ${receiptFile} (${data.length} bytes)`);

      const platform = process.platform;

      if (platform === 'win32') {
        console.log(`Sending to ${normalizedPort} via Windows copy command`);
        // Increased timeout to 30 seconds for slower printers
        execSync(`copy /b "${receiptFile}" ${normalizedPort}`, { encoding: 'utf8', timeout: 30000 });
      } else if (platform === 'linux' || platform === 'darwin') {
        console.log(`Sending to ${normalizedPort} via cat command`);
        execSync(`cat "${receiptFile}" > ${normalizedPort}`, { encoding: 'utf8', timeout: 30000 });
      } else {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      try {
        fs.unlinkSync(receiptFile);
      } catch (e) {
        console.warn('Failed to delete temp file:', e.message);
      }

      console.log('✅ USB print completed successfully');
      resolve({ success: true });

    } catch (error) {
      console.error('❌ USB print error:', error);

      // Provide more helpful error messages
      let errorMessage = error.message;
      if (error.message.includes('ENOENT') || error.message.includes('not recognized')) {
        errorMessage = `USB port "${port}" not found. Please check if the printer is connected and the COM port is correct.`;
      } else if (error.message.includes('EBUSY') || error.message.includes('Access is denied')) {
        errorMessage = `USB port "${port}" is busy or access denied. Please close any other applications using this port.`;
      } else if (error.message.includes('ETIMEDOUT') || error.message.includes('timeout')) {
        errorMessage = `USB printer timeout. The printer may be offline or not responding on port "${port}".`;
      }

      reject(new Error(errorMessage));
    }
  });
}

// Print receipt to USB
async function printReceiptToUSB(port, orderData, userProfile) {
  try {
    console.log(`📥 [usbPrinter.js] printReceiptToUSB - Port: ${port}`);

    const assets = await ensureAssets(
      userProfile?.store_logo,
      userProfile?.qr_code
    );

    const receiptData = await generateReceiptESCPOS(orderData, userProfile, assets);
    await sendToUSBPort(port, receiptData);

    return { success: true };
  } catch (error) {
    console.error('[usbPrinter.js] Receipt print error:', error);
    throw error;
  }
}

// Print kitchen token to USB
async function printKitchenTokenToUSB(port, orderData, userProfile) {
  try {
    console.log(`📥 [usbPrinter.js] printKitchenTokenToUSB - Port: ${port}`);

    const tokenData = await generateKitchenTokenESCPOS(orderData, userProfile);
    await sendToUSBPort(port, tokenData);

    return { success: true };
  } catch (error) {
    console.error('[usbPrinter.js] Kitchen token print error:', error);
    throw error;
  }
}

// Print receipt to USB printer
function registerUSBPrinter(ipcMain) {
  ipcMain.handle('printer-print-usb', async (event, { orderData, userProfile, printerConfig }) => {
    try {
      console.log('🎯 [usbPrinter.js] IPC: printer-print-usb');
      const port = printerConfig.usb_port || printerConfig.usb_device_path || 'COM3';
      await printReceiptToUSB(port, orderData, userProfile);
      return { success: true };
    } catch (error) {
      console.error('[usbPrinter.js] IPC error:', error.message);
      return { success: false, error: error.message };
    }
  });

  // Print kitchen token to USB printer
  ipcMain.handle('printer-print-usb-kitchen-token', async (event, { orderData, userProfile, printerConfig }) => {
    try {
      console.log('🎯 [usbPrinter.js] IPC: printer-print-usb-kitchen-token');
      const port = printerConfig.usb_port || printerConfig.usb_device_path || 'COM3';
      await printKitchenTokenToUSB(port, orderData, userProfile);
      return { success: true };
    } catch (error) {
      console.error('[usbPrinter.js] IPC error:', error.message);
      return { success: false, error: error.message };
    }
  });

  // List Windows printers (for Windows USB Printer Class devices)
  ipcMain.handle('printer-list-windows-printers', async () => {
    return await listWindowsPrinters();
  });

  // Print receipt to Windows USB printer (by Windows printer name)
  ipcMain.handle('printer-print-windows-usb', async (event, { orderData, userProfile, printerConfig }) => {
    try {
      const printerName = printerConfig.usb_printer_name;
      if (!printerName) return { success: false, error: 'No Windows printer name configured' };
      const assets = await ensureAssets(userProfile?.store_logo, userProfile?.qr_code);
      const receiptData = await generateReceiptESCPOS(orderData, userProfile, assets);
      await sendToWindowsPrinter(printerName, receiptData);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Print kitchen token to Windows USB printer
  ipcMain.handle('printer-print-windows-usb-kitchen', async (event, { orderData, userProfile, printerConfig }) => {
    try {
      const printerName = printerConfig.usb_printer_name;
      if (!printerName) return { success: false, error: 'No Windows printer name configured' };
      const tokenData = await generateKitchenTokenESCPOS(orderData, userProfile);
      await sendToWindowsPrinter(printerName, tokenData);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Test Windows USB printer
  ipcMain.handle('printer-test-windows-usb', async (event, { printerName }) => {
    try {
      const testData = Buffer.concat([
        CMD.INIT,
        CMD.ALIGN_CENTER,
        CMD.BOLD_ON,
        CMD.DOUBLE_ON,
        text('USB TEST PRINT\n'),
        CMD.DOUBLE_OFF,
        CMD.BOLD_OFF,
        drawLine('-'),
        text('Windows USB printer working!\n'),
        text('Connection successful.\n'),
        drawLine('-'),
        CMD.FEED,
        CMD.FEED,
        CMD.FEED,
        CMD.CUT
      ]);
      await sendToWindowsPrinter(printerName, testData);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Test USB printer connection
  ipcMain.handle('printer-test-usb', async (event, { port = 'COM3' }) => {
    try {
      const testData = Buffer.concat([
        CMD.INIT,
        CMD.ALIGN_CENTER,
        CMD.BOLD_ON,
        CMD.DOUBLE_ON,
        text('USB TEST PRINT\n'),
        CMD.DOUBLE_OFF,
        CMD.BOLD_OFF,
        drawLine('-'),
        text('Printer is working!\n'),
        text('Connection successful.\n'),
        drawLine('-'),
        CMD.FEED,
        CMD.FEED,
        CMD.FEED,
        CMD.CUT
      ]);

      await sendToUSBPort(port, testData);
      return { success: true };
    } catch (error) {
      console.error('USB test error:', error);
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  registerUSBPrinter,
  printReceiptToUSB,
  printKitchenTokenToUSB
};