const net = require('net');
const fs = require('fs');
const path = require('path');
const { printer: ThermalPrinter, types: PrinterTypes } = require('node-thermal-printer');
const { ensureAssets } = require('../handlers/onDemandAssetDownload');

// ========================================
// PAPER WIDTH CONFIGURATION
// 72mm thermal printer = 42 characters
// ========================================
const PAPER_WIDTH = 42;

function wrapText(text, maxLength = PAPER_WIDTH - 4) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  for (const word of words) {
    if ((currentLine + word).length <= maxLength) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

async function printReceipt(ip, port, orderData, userProfile) {
  return new Promise(async (resolve, reject) => {
    try {
      // Ensure assets are available before printing (downloads if needed)
      console.log('📥 Ensuring printer assets are ready...');
      console.log('📄 User Profile:', {
        store_logo: userProfile?.store_logo ? '✓ Present' : '✗ Missing',
        qr_code: userProfile?.qr_code ? '✓ Present' : '✗ Missing',
        store_name: userProfile?.store_name
      });

      const assets = await ensureAssets(
        userProfile?.store_logo,
        userProfile?.qr_code
      );

      const printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: `tcp://${ip}:${port}`,
        width: PAPER_WIDTH,
        characterSet: 'SLOVENIA',
        removeSpecialCharacters: false,
        lineCharacter: "-",
      });

      // Use downloaded assets
      const logoPath = assets.logo || null;
      const qrPath = assets.qr || null;

      const hasLogo = logoPath && fs.existsSync(logoPath);
      const hasQR = qrPath && fs.existsSync(qrPath);

      // Check if logo should be shown on receipt (default: true)
      const showLogoOnReceipt = userProfile?.show_logo_on_receipt !== false;

      console.log('Logo ready:', hasLogo ? '✓' : '✗', logoPath || 'N/A');
      console.log('QR ready:', hasQR ? '✓' : '✗', qrPath || 'N/A');
      console.log('Show logo on receipt:', showLogoOnReceipt ? '✓ Enabled' : '✗ Disabled');

      // ========================================
      // LOGO (if available and enabled)
      // ========================================
      if (showLogoOnReceipt && hasLogo) {
        try {
          console.log('🖼️ Printing logo on receipt (show_logo_on_receipt: true)');
          await printer.alignCenter();
          await printer.printImage(logoPath);
          // Add spacing after logo (2 lines for better visual separation)
          await printer.newLine();
          await printer.newLine();
        } catch (e) {
          console.log("Logo print failed:", e.message);
        }
      } else if (!showLogoOnReceipt) {
        console.log('🖼️ Logo printing disabled (show_logo_on_receipt: false)');
      }

      // ========================================
      // STORE HEADER
      // ========================================
      const storeName = userProfile?.store_name || '';
      const storeAddress = userProfile?.store_address || '';
      const storePhone = userProfile?.phone || '';
      const hashtag1 = userProfile?.hashtag1 || '';
      const hashtag2 = userProfile?.hashtag2 || '';
      const showFooterSection = userProfile?.show_footer_section !== false;
      const showBusinessNameOnReceipt = userProfile?.show_business_name_on_receipt !== false;

      if (storeName && showBusinessNameOnReceipt) {
        await printer.alignCenter();
        await printer.bold(true);
        await printer.setTextDoubleHeight();
        await printer.setTextDoubleWidth();
        await printer.println(storeName.toUpperCase());
        await printer.setTextNormal();
        await printer.bold(false);
        await printer.newLine();
      }

      if (storeAddress) {
        await printer.alignCenter();
        await printer.println(storeAddress);
      }

      if (storePhone) {
        await printer.alignCenter();
        await printer.println(`Ph: ${storePhone}`);
      }

      // Add spacing after store header section (if any header content was printed)
      if ((showLogoOnReceipt && hasLogo) || (storeName && showBusinessNameOnReceipt) || storeAddress || storePhone) {
        await printer.newLine();
      }

      // ========================================
      // ORDER RECEIPT HEADER
      // ========================================
      await printer.alignCenter();
      await printer.drawLine();
      await printer.println("ORDER RECEIPT");
      await printer.drawLine();

      // ========================================
      // ORDER DETAILS
      // ========================================
      const orderNumber = orderData.orderNumber || 'N/A';
      const formattedSerial = orderData.dailySerial
        ? `#${String(orderData.dailySerial).padStart(3, '0')}`
        : null;
      const orderDate = new Date();
      const dateStr = orderDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const timeStr = orderDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      await printer.alignCenter();
      await printer.leftRight("Invoice:", `#${orderNumber}`);
      if (formattedSerial) {
        await printer.leftRight("Token #:", formattedSerial);
      }
      await printer.leftRight("Date:", dateStr);
      await printer.leftRight("Time:", timeStr);
      
      if (orderData.orderType) {
        await printer.leftRight("Type:", orderData.orderType.toUpperCase());
      }

      if (orderData.tableName) {
        await printer.leftRight("Table:", orderData.tableName);
      }

      // Cashier name (admin's customer_name or cashier's name)
      const cashierName = userProfile?.cashier_name || userProfile?.customer_name || 'N/A';
      await printer.leftRight("Cashier:", cashierName);

      // ========================================
      // CUSTOMER INFO
      // ========================================
      if (orderData.customer) {
        const customerName = orderData.customer.full_name || 'Guest';
        await printer.leftRight("Customer:", customerName);
        
        if (orderData.customer.phone) {
          await printer.leftRight("Phone:", orderData.customer.phone);
        }
        
        if (orderData.orderType === 'delivery') {
          let address = orderData.deliveryAddress || orderData.customer?.addressline || orderData.customer?.address;
          if (address) {
            await printer.println("Address:");
            const lines = wrapText(address);
            for (const line of lines) {
              await printer.println(`  ${line}`);
            }
          }
        }
      }

      // ========================================
      // ITEMS SECTION
      // ========================================
      await printer.drawLine();
      await printer.alignCenter();
      await printer.println("ITEMS");
      await printer.drawLine();
      await printer.leftRight("ITEM", "AMOUNT");
      await printer.drawLine();

      console.log('🖨️ Printing cart items. Total items:', orderData.cart.length);

      for (const item of orderData.cart) {
        console.log('🖨️ Item:', JSON.stringify(item, null, 2));

        if (item.isDeal) {
          let dealName = `${item.quantity}x ${item.dealName}`;
          await printer.leftRight(dealName, `Rs ${item.totalPrice.toFixed(0)}`);

          if (item.dealProducts && item.dealProducts.length > 0) {
            await printer.alignLeft();
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
              await printer.println(productLine);
            }
          }
          const dealInstructions = item.itemInstructions || item.instructions;
          if (dealInstructions) {
            await printer.alignLeft();
            await printer.println(`  * ${dealInstructions}`);
          }
        } else {
          let itemName = `${item.quantity}x ${item.productName}`;
          if (item.variantName) itemName += ` (${item.variantName})`;
          await printer.leftRight(itemName, `Rs ${item.totalPrice.toFixed(0)}`);
          const itemInstructions = item.itemInstructions || item.instructions;
          if (itemInstructions) {
            await printer.alignLeft();
            await printer.println(`  * ${itemInstructions}`);
          }
        }
      }

      // ========================================
      // TOTALS SECTION
      // ========================================
      await printer.drawLine();
      const subtotal = parseFloat(orderData.subtotal || 0);
      const deliveryCharges = parseFloat(orderData.deliveryCharges || 0);
      const discountAmount = parseFloat(orderData.discountAmount || 0); // Smart discount only
      const loyaltyDiscountAmount = parseFloat(orderData.loyaltyDiscountAmount || 0);
      const loyaltyPointsRedeemed = parseInt(orderData.loyaltyPointsRedeemed || 0);

      await printer.leftRight("Subtotal:", `Rs ${subtotal.toFixed(0)}`);

      // Show smart discount if applicable
      if (discountAmount > 0) {
        const discountText = orderData.discountType === 'percentage'
          ? `Discount (${orderData.discountValue}%):`
          : 'Discount:';
        await printer.leftRight(discountText, `-Rs ${discountAmount.toFixed(0)}`);
      }

      // Show loyalty discount separately
      if (loyaltyDiscountAmount > 0) {
        const loyaltyText = loyaltyPointsRedeemed > 0
          ? `Loyalty (${loyaltyPointsRedeemed} pts):`
          : 'Loyalty Discount:';
        await printer.leftRight(loyaltyText, `-Rs ${loyaltyDiscountAmount.toFixed(0)}`);
      }

      if (orderData.orderType === 'delivery' && deliveryCharges > 0) {
        await printer.leftRight("Delivery Charges:", `Rs ${deliveryCharges.toFixed(0)}`);
      }

      // Calculate grand total with both discounts applied
      const totalDiscounts = discountAmount + loyaltyDiscountAmount;
      const grandTotal = subtotal - totalDiscounts + deliveryCharges;
      await printer.drawLine();
      await printer.bold(true);
      await printer.leftRight("GRAND TOTAL", `Rs ${grandTotal.toFixed(0)}`);
      await printer.bold(false);
      await printer.drawLine();

      // ========================================
      // PAYMENT SECTION
      // ========================================
      await printer.newLine();
      if (orderData.paymentMethod) {
        if (orderData.paymentMethod.toLowerCase() === 'unpaid') {
          await printer.alignCenter();
          await printer.bold(true);
          await printer.setTextDoubleHeight();
          await printer.setTextDoubleWidth();
          await printer.println("* UNPAID *");
          await printer.setTextNormal();
          await printer.bold(false);
          await printer.newLine();
        } else if (orderData.paymentMethod === 'Split' && orderData.paymentTransactions && orderData.paymentTransactions.length > 0) {
          // Handle Split Payment - show breakdown
          await printer.alignCenter();
          await printer.bold(true);
          await printer.println("PAID via SPLIT PAYMENT");
          await printer.bold(false);
          await printer.newLine();

          // Show each payment method breakdown
          for (const transaction of orderData.paymentTransactions) {
            await printer.leftRight(
              `${transaction.payment_method}:`,
              `Rs ${parseFloat(transaction.amount).toFixed(0)}`
            );
          }
          await printer.newLine();
        } else {
          await printer.alignCenter();
          await printer.bold(true);
          await printer.println(`PAID via ${orderData.paymentMethod.toUpperCase()}`);
          await printer.bold(false);

          if (orderData.paymentMethod === 'Cash' && orderData.cashReceived) {
            await printer.leftRight("Cash Received:", `Rs ${orderData.cashReceived.toFixed(0)}`);
            if (orderData.changeAmount && orderData.changeAmount > 0) {
              await printer.leftRight("Change:", `Rs ${orderData.changeAmount.toFixed(0)}`);
            }
          }
          await printer.newLine();
        }
      }

      await printer.drawLine();

      // ========================================
      // FOOTER SECTION (Optional)
      // ========================================
      if (showFooterSection) {
        if (hasQR) {
          try {
            console.log('🖨️ Printing QR code from:', qrPath);
            await printer.alignCenter();
            await printer.printImage(qrPath);
            await printer.newLine();
            await printer.newLine();
            console.log('✅ QR code printed successfully');
          } catch (e) {
            console.error("❌ QR print failed:", e.message);
          }
        } else {
          console.log('⚠️ QR code not available - hasQR:', hasQR, 'qrPath:', qrPath);
        }

        await printer.alignCenter();
        await printer.println("Drop a review & flex on us!");
        await printer.println("Your feedback = our glow up");
        await printer.newLine();

        if (hashtag1 || hashtag2) {
          const hashtagLine = [hashtag1, hashtag2].filter(Boolean).join(' ');
          await printer.bold(true);
          await printer.println(hashtagLine);
          await printer.bold(false);
        }
      }

      // ========================================
      // POWERED BY & CUT
      // ========================================
      await printer.newLine();
      await printer.alignCenter();
      await printer.println("Powered by airoxlab.com");

      await printer.cut();

      const success = await printer.execute();
      if (success) resolve({ success: true });
      else reject(new Error("Print failed"));
    } catch (err) {
      console.error("Print error:", err);
      reject(err);
    }
  });
}

function registerReceiptPrinter(ipcMain) {
  ipcMain.handle('printer-print-receipt', async (event, { orderData, userProfile, printerConfig }) => {
    try {
      const printerType = printerConfig.printer_type || 'ip';

      if (printerType === 'usb') {
        console.log('Receipt printing routed to USB handler');
        return { success: false, error: 'Use printer-print-usb for USB printers' };
      } else {
        const ip = printerConfig.ip_address || printerConfig.ip;
        const port = parseInt(printerConfig.port || '9100');
        await printReceipt(ip, port, orderData, userProfile);
        return { success: true };
      }
    } catch (error) {
      console.error('Error printing receipt:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('printer-raw-test', async (event, { ip, port = '9100' }) => {
    try {
      const testPrinter = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: `tcp://${ip}:${port}`,
        width: PAPER_WIDTH
      });
      await testPrinter.alignCenter();
      await testPrinter.println("TEST PRINT");
      await testPrinter.drawLine();
      await testPrinter.println("Printer is working fine!");
      await testPrinter.cut();
      await testPrinter.execute();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { registerReceiptPrinter };