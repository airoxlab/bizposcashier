// Printer utility functions for Epson integration
// This is a placeholder structure for future Epson printer implementation

export class EpsonPrinter {
  constructor() {
    this.isConnected = false
    this.printerName = ''
  }

  // Check if printer is connected
  async checkConnection() {
    try {
      // This will be implemented with actual Epson SDK
      console.log('Checking printer connection...')
      return this.isConnected
    } catch (error) {
      console.error('Printer connection check failed:', error)
      return false
    }
  }

  // Initialize printer connection
  async connect(printerName = 'EPSON_PRINTER') {
    try {
      // This will be implemented with Epson SDK
      console.log(`Connecting to printer: ${printerName}`)
      this.printerName = printerName
      this.isConnected = true
      return true
    } catch (error) {
      console.error('Failed to connect to printer:', error)
      this.isConnected = false
      return false
    }
  }

  // Disconnect from printer
  async disconnect() {
    try {
      console.log('Disconnecting from printer...')
      this.isConnected = false
      this.printerName = ''
      return true
    } catch (error) {
      console.error('Failed to disconnect from printer:', error)
      return false
    }
  }

  // Print receipt
  async printReceipt(orderData) {
    if (!this.isConnected) {
      throw new Error('Printer not connected')
    }

    try {
      console.log('Printing receipt for order:', orderData.orderNumber)
      
      // This will be implemented with Epson ESC/POS commands
      const receiptData = this.formatReceiptData(orderData)
      
      // For now, use browser print as fallback
      this.fallbackPrint(receiptData)
      
      return true
    } catch (error) {
      console.error('Failed to print receipt:', error)
      throw error
    }
  }

  // Format receipt data for Epson printer
  formatReceiptData(orderData) {
    // ESC/POS commands will be implemented here
    return {
      header: this.createHeader(orderData),
      items: this.createItemsList(orderData.items),
      totals: this.createTotals(orderData),
      footer: this.createFooter()
    }
  }

  createHeader(orderData) {
    return [
      { type: 'text', content: orderData.storeName, align: 'center', size: 'large' },
      { type: 'text', content: orderData.storeAddress || '', align: 'center' },
      { type: 'line' },
      { type: 'text', content: `Order #: ${orderData.orderNumber}` },
      { type: 'text', content: `Date: ${new Date().toLocaleDateString()}` },
      { type: 'text', content: `Time: ${new Date().toLocaleTimeString()}` },
      { type: 'text', content: `Type: ${orderData.orderType.toUpperCase()}` },
      { type: 'line' }
    ]
  }

  createItemsList(items) {
    const itemLines = []
    items.forEach(item => {
      itemLines.push({
        type: 'text',
        content: `${item.productName}${item.variantName ? ` (${item.variantName})` : ''}`,
        style: 'bold'
      })
      itemLines.push({
        type: 'text',
        content: `${item.quantity} x Rs ${item.finalPrice} = Rs ${item.totalPrice.toFixed(2)}`,
        align: 'right'
      })
    })
    return itemLines
  }

  createTotals(orderData) {
    const totals = []
    
    totals.push({ type: 'line' })
    totals.push({
      type: 'text',
      content: `Subtotal: Rs ${orderData.subtotal.toFixed(2)}`,
      align: 'right'
    })
    
    if (orderData.discountAmount > 0) {
      totals.push({
        type: 'text',
        content: `Discount: -Rs ${orderData.discountAmount.toFixed(2)}`,
        align: 'right'
      })
    }
    
    if (orderData.deliveryCharges > 0) {
      totals.push({
        type: 'text',
        content: `Delivery: Rs ${orderData.deliveryCharges.toFixed(2)}`,
        align: 'right'
      })
    }
    
    totals.push({
      type: 'text',
      content: `TOTAL: Rs ${orderData.totalAmount.toFixed(2)}`,
      align: 'right',
      style: 'bold',
      size: 'large'
    })
    
    return totals
  }

  createFooter() {
    return [
      { type: 'line' },
      { type: 'text', content: 'Thank you for your order!', align: 'center' },
      { type: 'text', content: 'Come again soon!', align: 'center' },
      { type: 'cut' }
    ]
  }

  // Fallback print using browser
  fallbackPrint(receiptData) {
    const printWindow = window.open('', '_blank')
    const html = this.convertToHTML(receiptData)
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.print()
  }

  convertToHTML(receiptData) {
    // Convert receipt data to HTML for browser printing
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt</title>
        <style>
          body { font-family: 'Courier New', monospace; font-size: 12px; margin: 0; padding: 20px; }
          .receipt { max-width: 300px; margin: 0 auto; }
          .center { text-align: center; }
          .right { text-align: right; }
          .bold { font-weight: bold; }
          .large { font-size: 16px; }
          .line { border-bottom: 1px solid #000; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="receipt">
    `
    
    // Add header
    receiptData.header.forEach(line => {
      html += this.formatLine(line)
    })
    
    // Add items
    receiptData.items.forEach(line => {
      html += this.formatLine(line)
    })
    
    // Add totals
    receiptData.totals.forEach(line => {
      html += this.formatLine(line)
    })
    
    // Add footer
    receiptData.footer.forEach(line => {
      html += this.formatLine(line)
    })
    
    html += `
        </div>
      </body>
      </html>
    `
    
    return html
  }

  formatLine(line) {
    if (line.type === 'line') {
      return '<div class="line"></div>'
    }
    
    if (line.type === 'cut') {
      return ''
    }
    
    let classes = []
    if (line.align) classes.push(line.align)
    if (line.style) classes.push(line.style)
    if (line.size) classes.push(line.size)
    
    const classStr = classes.length > 0 ? ` class="${classes.join(' ')}"` : ''
    
    return `<div${classStr}>${line.content}</div>`
  }
}

// Export default instance
export const printer = new EpsonPrinter()

// Utility functions
export const initializePrinter = async () => {
  try {
    const connected = await printer.connect()
    if (connected) {
      console.log('Printer initialized successfully')
      return true
    } else {
      console.warn('Failed to initialize printer')
      return false
    }
  } catch (error) {
    console.error('Printer initialization error:', error)
    return false
  }
}
// Frontend function to print receipt
async function printOrderReceipt(orderData) {
  try {
    // Get user profile data from localStorage
    const userFromStorage = JSON.parse(localStorage.getItem('user') || '{}');
    const userProfileFromStorage = JSON.parse(localStorage.getItem('user_profile') || '{}');
    
    // Merge user data - prioritize user_profile, fallback to user data
    const userProfile = {
      store_name: userProfileFromStorage.store_name || userFromStorage.store_name || '',
      store_address: userProfileFromStorage.store_address || userFromStorage.store_address || '',
      phone: userProfileFromStorage.phone || userFromStorage.phone || '',
      email: userProfileFromStorage.email || userFromStorage.email || '',
      store_logo: userProfileFromStorage.store_logo || userFromStorage.store_logo || null,
      customer_name: userFromStorage.customer_name || ''
    };

    console.log('Sending print request with user profile:', userProfile);

    const response = await fetch('/api/printer/receipt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderData: orderData,
        userProfile: userProfile
      })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Receipt printed successfully:', result.message);
      // Show success notification
      showNotification('Receipt printed successfully!', 'success');
    } else {
      console.error('❌ Print failed:', result.error);
      // Show error notification
      showNotification(`Print failed: ${result.message || result.error}`, 'error');
    }

    return result;

  } catch (error) {
    console.error('Print request error:', error);
    showNotification('Failed to send print request', 'error');
    return { success: false, error: error.message };
  }
}

// Helper function for notifications (adjust based on your notification system)
function showNotification(message, type = 'info') {
  // Replace this with your actual notification system
  if (type === 'success') {
    // Success notification
    console.log('✅ SUCCESS:', message);
  } else if (type === 'error') {
    // Error notification  
    console.error('❌ ERROR:', message);
  } else {
    // Info notification
    console.log('ℹ️ INFO:', message);
  }
}

// Example usage:
// When you want to print a receipt after order completion:
/*
const orderData = {
  orderNumber: '664',
  total: 1080,
  cart: [
    { quantity: 1, productName: 'Mint Margarita', totalPrice: 150 },
    { quantity: 2, productName: 'Cold Coffee', totalPrice: 400 },
    { quantity: 1, productName: 'Zinger Burger', totalPrice: 350 },
    { quantity: 1, productName: 'Fries Large', totalPrice: 180 }
  ],
  orderType: 'dine-in',
  paymentMethod: 'Cash',
  // ... other order data
};

printOrderReceipt(orderData);
*/