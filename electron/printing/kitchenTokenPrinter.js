const { printer: ThermalPrinter, types: PrinterTypes } = require('node-thermal-printer');

// ========================================
// PAPER WIDTH CONFIGURATION
// 72mm thermal printer = 42 characters
// ========================================
const PAPER_WIDTH = 42;

/**
 * Print Kitchen Token
 * Clean and professional design for kitchen staff
 * NO LOGO OR QR CODE - Fast text-only printing
 */
async function printKitchenToken(ip, port, orderData, userProfile) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('🍳 [kitchenTokenPrinter.js] Generating KITCHEN TOKEN via Ethernet');
      console.log(`📡 [kitchenTokenPrinter.js] IP: ${ip}, Port: ${port}`);

      // Initialize printer with consistent width
      const printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: `tcp://${ip}:${port}`,
        width: PAPER_WIDTH,
        characterSet: 'SLOVENIA',
        removeSpecialCharacters: false,
        lineCharacter: "-",
      });

      // ========================================
      // HEADER SECTION
      // ========================================
      await printer.alignCenter();
      await printer.bold(true);
      await printer.setTextDoubleHeight();
      await printer.println("KITCHEN TOKEN");
      await printer.setTextNormal();
      await printer.bold(false);

      await printer.alignCenter();
      await printer.drawLine();

      // ========================================
      // ORDER INFO - Left-Right aligned
      // ========================================
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

      await printer.alignCenter();
      await printer.bold(true);
      if (formattedSerial) {
        await printer.leftRight("Token #", formattedSerial);
        await printer.bold(false);
        await printer.leftRight("Ref:", orderNumber);
      } else {
        await printer.leftRight("Token #", orderNumber);
        await printer.bold(false);
      }
      await printer.leftRight("Date:", formattedDate);
      await printer.leftRight("Time:", formattedTime);
      await printer.leftRight("Type:", orderType);

      // Cashier name (admin's customer_name or cashier's name)
      const cashierName = userProfile?.cashier_name || userProfile?.customer_name || 'N/A';
      await printer.leftRight("Cashier:", cashierName);

      await printer.drawLine();

      // ========================================
      // ITEMS SECTION
      // ========================================
      await printer.alignCenter();
      await printer.bold(true);
      await printer.println("ITEMS");
      await printer.bold(false);
      await printer.drawLine();

      await printer.leftRight("Item Name", "Qty");
      await printer.drawLine();

      if (orderData.items && orderData.items.length > 0) {
        for (const item of orderData.items) {
          const ct = item.changeType;

          if (item.isDeal) {
            let itemName = item.name;
            const maxNameLength = PAPER_WIDTH - 4;
            if (itemName.length > maxNameLength) itemName = itemName.substring(0, maxNameLength);

            await printer.alignLeft();
            if (ct === 'modified') {
              await printer.leftRight(itemName, `Before: ${item.oldQuantity}`);
              await printer.leftRight('', `After:  ${item.newQuantity}`);
            } else if (ct === 'added') {
              await printer.leftRight(`+ ${itemName}`, item.quantity.toString());
            } else if (ct === 'removed') {
              await printer.leftRight(`- ${itemName}`, item.quantity.toString());
            } else {
              await printer.leftRight(itemName, item.quantity.toString());
            }

            if (item.dealProducts && item.dealProducts.length > 0) {
              await printer.alignLeft();
              for (const product of item.dealProducts) {
                const variantName = product.variant ||
                  (product.flavor ?
                    (typeof product.flavor === 'object' ? (product.flavor.flavor_name || product.flavor.name) : product.flavor)
                    : null);
                let productLine = `  ${product.quantity}x ${product.name}`;
                if (variantName) productLine += ` - ${variantName}`;
                await printer.println(productLine);
              }
            }
            if (item.instructions) {
              await printer.println(`  * ${item.instructions}`);
            }
          } else {
            let itemName = item.name;
            if (item.size) itemName = `${item.name} (${item.size})`;
            const maxNameLength = PAPER_WIDTH - 4;
            if (itemName.length > maxNameLength) itemName = itemName.substring(0, maxNameLength);

            await printer.alignLeft();
            if (ct === 'modified') {
              await printer.leftRight(itemName, `Before: ${item.oldQuantity}`);
              await printer.leftRight('', `After:  ${item.newQuantity}`);
            } else if (ct === 'added') {
              await printer.leftRight(`+ ${itemName}`, item.quantity.toString());
            } else if (ct === 'removed') {
              await printer.leftRight(`- ${itemName}`, item.quantity.toString());
            } else {
              await printer.leftRight(itemName, item.quantity.toString());
            }
            if (item.instructions) {
              await printer.println(`  * ${item.instructions}`);
            }
          }
        }
      } else {
        await printer.alignCenter();
        await printer.println("No items");
      }

      await printer.drawLine();

      // ========================================
      // SPECIAL NOTES
      // ========================================
      if (orderData.specialNotes || orderData.notes) {
        await printer.bold(true);
        await printer.println("SPECIAL NOTES:");
        await printer.bold(false);
        await printer.println(orderData.specialNotes || orderData.notes);
        await printer.drawLine();
      }

      // ========================================
      // PRIORITY INDICATOR
      // ========================================
      if (orderData.orderType === 'delivery') {
        await printer.alignCenter();
        await printer.bold(true);
        await printer.setTextDoubleHeight();
        await printer.println("DELIVERY");
        await printer.setTextNormal();
        await printer.bold(false);
        await printer.alignCenter();
        await printer.drawLine();
        const deliveryAddr = orderData.deliveryAddress || orderData.customerAddress;
        if (deliveryAddr) {
          await printer.alignLeft();
          await printer.bold(true);
          await printer.println("Address:");
          await printer.bold(false);
          await printer.println(`  ${deliveryAddr}`);
          await printer.drawLine();
        }
      } else if (orderData.orderType === 'takeaway') {
        await printer.alignCenter();
        await printer.bold(true);
        await printer.setTextDoubleHeight();
        await printer.println("TAKEAWAY");
        await printer.setTextNormal();
        await printer.bold(false);
        await printer.alignCenter();
        await printer.drawLine();
      } else if (orderData.orderType === 'walkin' && orderData.tableName) {
        await printer.alignCenter();
        await printer.bold(true);
        await printer.setTextDoubleHeight();
        await printer.println(orderData.tableName);
        await printer.setTextNormal();
        await printer.bold(false);
        await printer.alignCenter();
        await printer.drawLine();
      }

      // ========================================
      // FOOTER & CUT
      // ========================================
      await printer.alignCenter();
      await printer.println("Powered by airoxlab.com");

      await printer.newLine();
      await printer.newLine();
      await printer.cut();

      const success = await printer.execute();
      if (success) {
        console.log('✅ [kitchenTokenPrinter.js] Kitchen token printed successfully');
        resolve({ success: true });
      } else {
        console.error('❌ [kitchenTokenPrinter.js] Kitchen token print failed');
        reject(new Error("Kitchen token print failed"));
      }
    } catch (err) {
      console.error("❌ [kitchenTokenPrinter.js] Kitchen token print error:", err);
      reject(err);
    }
  });
}

module.exports = { printKitchenToken };