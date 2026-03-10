// Receipt formatter utility for thermal printers
import { assetManager } from '../assetManager'

export class ReceiptFormatter {
  constructor() {
    this.CPL = 42 // Characters per line for 80mm paper
    this.LEFT_PAD = '  ' // 2 spaces for left margin
  }

  // Format line with padding
  paddedLine(text = '') {
    return this.LEFT_PAD + text + '\n'
  }

  // Center text
  centerLine(text) {
    const printableWidth = this.CPL - this.LEFT_PAD.length
    const pad = Math.floor((printableWidth - text.length) / 2)
    const centered = ' '.repeat(Math.max(0, pad)) + text
    return this.paddedLine(centered)
  }

  // Left-right justified text
  leftRight(left, right) {
    const printableWidth = this.CPL - this.LEFT_PAD.length
    let spaces = printableWidth - left.length - right.length
    if (spaces < 1) spaces = 1
    return this.paddedLine(left + ' '.repeat(spaces) + right)
  }

  // Wrap long item names
  wrapItem(name, amount, rightCol = 10) {
    const printableWidth = this.CPL - this.LEFT_PAD.length
    const leftCol = printableWidth - rightCol
    const words = name.split(/\s+/)
    const lines = []
    let row = ''

    for (const word of words) {
      const next = row ? row + ' ' + word : word
      if (next.length <= leftCol) {
        row = next
      } else {
        if (row) lines.push(row)
        row = word
      }
    }
    if (row) lines.push(row)

    let result = ''
    lines.forEach((txt, i) => {
      if (i === 0) {
        result += this.paddedLine(txt.padEnd(leftCol, ' ') + amount.padStart(rightCol, ' '))
      } else {
        result += this.paddedLine(txt.padEnd(printableWidth, ' '))
      }
    })
    return result
  }

  // Format currency
  formatCurrency(amount) {
    return `Rs ${parseFloat(amount).toFixed(2)}`
  }

  // Format date and time
  formatDateTime() {
    const now = new Date()
    const options = { 
      weekday: 'short', 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    }
    const date = now.toLocaleDateString('en-US', options)
    const time = now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    })
    
    return { date, time }
  }

  // Generate complete receipt content
  generateReceipt(orderData, userProfile, printer) {
    const { date, time } = this.formatDateTime()
    let receipt = ''

    // Get cached assets (logo and QR code)
    const cachedAssets = assetManager.getAssets()

    // Header section
    receipt += '\n\n' // Top padding

    // Add store logo if available from cache (using data attribute for HTML rendering)
    if (cachedAssets.logo) {
      receipt += `[LOGO:${cachedAssets.logo}]\n\n`
    }

    receipt += this.centerLine(userProfile.store_name || 'GEN Z CAFE')
    receipt += this.centerLine(userProfile.store_address || 'Gulshan e Madina, Jhang Road')
    receipt += this.centerLine(`Bhakkar | Ph: ${userProfile.phone || '0310-1731573'}`)
    receipt += '\n'

    // Receipt info
    receipt += this.paddedLine('='.repeat(this.CPL - this.LEFT_PAD.length))
    receipt += this.centerLine('ORDER RECEIPT')
    receipt += this.paddedLine('='.repeat(this.CPL - this.LEFT_PAD.length))

    receipt += this.leftRight('Invoice:', orderData.orderNumber || '#001')
    receipt += this.leftRight('Date:', date)
    receipt += this.leftRight('Time:', time)
    
    // Customer info
    if (orderData.customer) {
      receipt += this.leftRight('Customer:', `${orderData.customer.first_name} ${orderData.customer.last_name}`)
      if (orderData.customer.phone) {
        receipt += this.leftRight('Phone:', orderData.customer.phone)
      }
    }
    
    receipt += this.leftRight('Type:', orderData.orderType?.toUpperCase() || 'WALK-IN')
    receipt += '\n'

    // Items section
    receipt += this.paddedLine('-'.repeat(this.CPL - this.LEFT_PAD.length))
    receipt += this.leftRight('ITEM', 'AMOUNT')
    receipt += this.paddedLine('-'.repeat(this.CPL - this.LEFT_PAD.length))

    // Order items
    orderData.cart.forEach(item => {
      let itemName = item.productName
      if (item.variantName) {
        itemName += ` (${item.variantName})`
      }
      const itemLine = `${item.quantity}x ${itemName}`
      receipt += this.wrapItem(itemLine, this.formatCurrency(item.totalPrice))
    })

    // Totals section
    receipt += this.paddedLine('-'.repeat(this.CPL - this.LEFT_PAD.length))
    
    receipt += this.leftRight('SUBTOTAL', this.formatCurrency(orderData.subtotal))
    
    if (orderData.discountAmount > 0) {
      receipt += this.leftRight('DISCOUNT', `-${this.formatCurrency(orderData.discountAmount)}`)
    }
    
    receipt += this.leftRight('GRAND TOTAL', this.formatCurrency(orderData.total))
    receipt += '\n'

    // Payment info
    if (orderData.paymentMethod === 'Split' && orderData.paymentTransactions && orderData.paymentTransactions.length > 0) {
      // Handle Split Payment - show breakdown
      receipt += this.centerLine('PAID via SPLIT PAYMENT')
      receipt += '\n'

      // Show each payment method breakdown
      for (const transaction of orderData.paymentTransactions) {
        receipt += this.leftRight(
          `${transaction.payment_method}:`,
          this.formatCurrency(transaction.amount)
        )
      }
      receipt += '\n'
    } else {
      receipt += this.leftRight('PAYMENT METHOD', orderData.paymentMethod?.toUpperCase() || 'CASH')

      if (orderData.paymentMethod === 'Cash' && orderData.cashReceived) {
        receipt += this.leftRight('CASH RECEIVED', this.formatCurrency(orderData.cashReceived))
        if (orderData.change > 0) {
          receipt += this.leftRight('CHANGE', this.formatCurrency(orderData.change))
        }
      }

      receipt += '\n'
      receipt += this.centerLine('* PAID *')
    }
    
    // Special instructions
    if (orderData.orderInstructions) {
      receipt += '\n'
      receipt += this.paddedLine('INSTRUCTIONS:')
      receipt += this.paddedLine(orderData.orderInstructions)
    }

    // Footer
    receipt += '\n'
    receipt += this.centerLine('Thanks for visiting!')
    receipt += this.centerLine('See you soon!')

    // Add QR code if available from cache
    if (cachedAssets.qrCode) {
      receipt += '\n'
      receipt += `[QR:${cachedAssets.qrCode}]\n`
      receipt += '\n'
    }

    receipt += this.paddedLine('='.repeat(this.CPL - this.LEFT_PAD.length))
    receipt += '\n'
    receipt += this.centerLine('Powered by ibexcodes.com')

    // Extra feed for safe cut
    receipt += '\n\n\n\n'

    return receipt
  }

  /**
   * Convert receipt text to HTML with image support for logo and QR code
   */
  convertToHTML(receiptText) {
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt</title>
        <style>
          @media print {
            @page { margin: 0; }
            body { margin: 0; }
          }
          body {
            font-family: 'Courier New', monospace;
            font-size: 12px;
            margin: 0;
            padding: 20px;
            background: white;
          }
          .receipt {
            max-width: 300px;
            margin: 0 auto;
          }
          .receipt-logo {
            max-width: 200px;
            height: auto;
            display: block;
            margin: 10px auto;
          }
          .receipt-qr {
            max-width: 150px;
            height: auto;
            display: block;
            margin: 10px auto;
          }
          .line {
            white-space: pre;
            font-family: 'Courier New', monospace;
          }
        </style>
      </head>
      <body>
        <div class="receipt">
    `

    // Process each line
    const lines = receiptText.split('\n')
    lines.forEach(line => {
      // Check for logo placeholder
      if (line.startsWith('[LOGO:')) {
        const base64Data = line.substring(6, line.length - 1) // Remove [LOGO: and ]
        html += `<img src="${base64Data}" class="receipt-logo" alt="Store Logo" />`
      }
      // Check for QR code placeholder
      else if (line.startsWith('[QR:')) {
        const base64Data = line.substring(4, line.length - 1) // Remove [QR: and ]
        html += `<img src="${base64Data}" class="receipt-qr" alt="QR Code" />`
      }
      // Regular text line
      else {
        // Escape HTML characters
        const escaped = line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
        html += `<div class="line">${escaped}</div>`
      }
    })

    html += `
        </div>
      </body>
      </html>
    `

    return html
  }
}

export default ReceiptFormatter