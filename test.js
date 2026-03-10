const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Button } = require('selenium-webdriver');

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
  FEED: Buffer.from([LF]),
  // Set left margin: ESC L nL nH (margin in dots, 1 dot = 0.125mm for 203dpi)
  // 24 dots = 3mm left margin
  LEFT_MARGIN: Buffer.from([ESC, 0x24, 24, 0x00]),
  // Set print area width
  SET_PRINT_AREA: Buffer.from([GS, 0x57, 0x00, 0x02]) // 512 dots width
};

// Helper: Text to buffer
function text(str) {
  return Buffer.from(str, 'utf8');
}

// Paper width in characters (58mm = 32 chars, 72mm/80mm = 42-48 chars)
// Using 42 for 72mm thermal printer
const PAPER_WIDTH = 42;

// Helper: Draw separator line with margins
function drawLine(char = '-') {
  return text(char.repeat(PAPER_WIDTH) + '\n');
}

// Helper: Center text within paper width
function centerText(str) {
  if (str.length >= PAPER_WIDTH) {
    return text(str.substring(0, PAPER_WIDTH) + '\n');
  }
  const padding = Math.floor((PAPER_WIDTH - str.length) / 2);
  return text(' '.repeat(padding) + str + '\n');
}

// Helper: Left-right aligned text with consistent margins
function leftRight(left, right) {
  const maxLeft = PAPER_WIDTH - right.length - 1;
  const leftTruncated = left.length > maxLeft ? left.substring(0, maxLeft) : left;
  const spaces = PAPER_WIDTH - leftTruncated.length - right.length;
  return text(leftTruncated + ' '.repeat(Math.max(1, spaces)) + right + '\n');
}

// Helper: Left aligned text with margin
function leftText(str) {
  if (str.length > PAPER_WIDTH) {
    return text(str.substring(0, PAPER_WIDTH) + '\n');
  }
  return text(str + '\n');
}

// Generate kitchen token ESC/POS commands
function generateKitchenTokenESCPOS(orderData) {
  console.log('🍳 Generating KITCHEN TOKEN...');
  const commands = [];

  // Initialize printer
  commands.push(CMD.INIT);
  
  // Set consistent left margin for entire receipt (in dots)
  // ESC $ nL nH - Set absolute print position
  // We'll use a different approach: add space prefix to all left-aligned text

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
  // ORDER INFO - Using center alignment for consistency
  // ========================================
  commands.push(CMD.ALIGN_CENTER);
  
  const orderNumber = orderData.orderNumber || 'N/A';
  const formattedTime = orderData.time || new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  const orderType = orderData.orderType ? orderData.orderType.toUpperCase() : 'WALKIN';

  commands.push(CMD.BOLD_ON);
  commands.push(leftRight('Token #', orderNumber));
  commands.push(CMD.BOLD_OFF);
  commands.push(leftRight('Time:', formattedTime));
  commands.push(leftRight('Type:', orderType));

  if (orderData.customerName) {
    commands.push(leftRight('Customer:', orderData.customerName));
  }
  if (orderData.customerPhone) {
    commands.push(leftRight('Phone:', orderData.customerPhone));
  }

  commands.push(drawLine('-'));

  // ========================================
  // ITEMS SECTION
  // ========================================
  commands.push(CMD.ALIGN_CENTER);
  commands.push(CMD.BOLD_ON);
  commands.push(text('ITEMS\n'));
  commands.push(CMD.BOLD_OFF);
  commands.push(drawLine('-'));

  // Item header row
  commands.push(leftRight('Item Name', 'Qty'));
  commands.push(drawLine('-'));

  // Items
  if (orderData.items && orderData.items.length > 0) {
    for (const item of orderData.items) {
      let itemName = item.name;
      if (item.size) {
        itemName = `${item.name} (${item.size})`;
      }

      // Truncate if too long (leave space for qty)
      const maxNameLength = PAPER_WIDTH - 4; // Leave space for qty
      if (itemName.length > maxNameLength) {
        itemName = itemName.substring(0, maxNameLength);
      }

      commands.push(CMD.BOLD_ON);
      commands.push(leftRight(itemName, item.quantity.toString()));
      commands.push(CMD.BOLD_OFF);

      // Deal products
      if (item.isDeal && item.dealProducts) {
        for (const product of item.dealProducts) {
          let productLine = `  ${product.quantity}x ${product.name}`;
          if (product.flavor) {
            const flavorName = typeof product.flavor === 'object' 
              ? (product.flavor.flavor_name || product.flavor.name) 
              : product.flavor;
            if (flavorName) productLine += ` (${flavorName})`;
          }
          commands.push(leftText(productLine));
        }
      }

      // Item notes
      if (item.notes) {
        commands.push(leftText(`  ** ${item.notes} **`));
      }
    }
  } else {
    commands.push(centerText('No items'));
  }

  commands.push(drawLine('-'));

  // ========================================
  // SPECIAL NOTES
  // ========================================
  if (orderData.specialNotes || orderData.notes) {
    commands.push(CMD.BOLD_ON);
    commands.push(leftText('SPECIAL NOTES:'));
    commands.push(CMD.BOLD_OFF);
    commands.push(leftText(orderData.specialNotes || orderData.notes));
    commands.push(drawLine('-'));
  }

  // ========================================
  // PRIORITY INDICATOR (Order Type)
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
  } else if (orderData.orderType === 'takeaway') {
    commands.push(CMD.ALIGN_CENTER);
    commands.push(CMD.BOLD_ON);
    commands.push(CMD.DOUBLE_HEIGHT);
    commands.push(text('TAKEAWAY\n'));
    commands.push(CMD.NORMAL);
    commands.push(CMD.BOLD_OFF);
    commands.push(CMD.ALIGN_CENTER);
    commands.push(drawLine('='));
  }

  // ========================================
  // FOOTER & CUT
  // ========================================
  commands.push(CMD.ALIGN_CENTER);
  commands.push(text('Powered by airoxlab.com\n'));

  commands.push(CMD.FEED);
  commands.push(CMD.FEED);
  commands.push(CMD.CUT);

  return Buffer.concat(commands);
}

// Send to USB printer
function sendToUSBPort(port, data) {
  return new Promise((resolve, reject) => {
    try {
      const normalizedPort = port.trim().toUpperCase();
      console.log(`📍 Sending to USB Port: ${normalizedPort}`);

      const tempDir = path.join(process.env.TEMP || '/tmp', 'pos-receipts');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const receiptFile = path.join(tempDir, `receipt_${Date.now()}.prn`);
      fs.writeFileSync(receiptFile, data);

      console.log(`📄 Receipt file: ${receiptFile} (${data.length} bytes)`);

      // Windows copy command
      execSync(`copy /b "${receiptFile}" ${normalizedPort}`, { 
        encoding: 'utf8', 
        timeout: 30000 
      });

      // Clean up
      try {
        fs.unlinkSync(receiptFile);
      } catch (e) {
        console.warn('Cleanup warning:', e.message);
      }

      console.log('✅ Print completed successfully!');
      resolve({ success: true });

    } catch (error) {
      console.error('❌ Print error:', error.message);
      reject(error);
    }
  });
}

// ========================================
// TEST DATA - Modify this to test different scenarios
// ========================================
const testOrderData = {
  orderNumber: 'ORD766409988',
  time: '08:43 PM',
  orderType: 'delivery',
  customerName: '',
  customerPhone: '03171640134',
  items: [
    {
      name: 'Cheesy Supreme',
      size: 'medium',
      quantity: 1,
      notes: ''
    }
  ],
  specialNotes: ''
};

// ========================================
// MAIN EXECUTION
// ========================================
async function main() {
  const USB_PORT = 'COM3'; // Change this if your printer is on a different port
  
  console.log('🖨️  Kitchen Token Printer Test');
  console.log('================================');
  console.log(`Port: ${USB_PORT}`);
  console.log(`Paper Width: ${PAPER_WIDTH} characters`);
  console.log('');

  try {
    const tokenData = generateKitchenTokenESCPOS(testOrderData);
    await sendToUSBPort(USB_PORT, tokenData);
    console.log('');
    console.log('✅ Test print sent successfully!');
  } catch (error) {
    console.error('');
    console.error('❌ Failed to print:', error.message);
    process.exit(1);
  }
}

main();


