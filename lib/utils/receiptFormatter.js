// Receipt formatter utility for thermal printers

function getLocalAssets() {
  try {
    return {
      logo: localStorage.getItem('store_logo_local') || null,
      qrCode: localStorage.getItem('qr_code_local') || null,
    }
  } catch {
    return { logo: null, qrCode: null }
  }
}

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

    const cachedAssets = getLocalAssets()

    const showLogo = userProfile?.show_logo_on_receipt !== false
    const showBusinessName = userProfile?.show_business_name_on_receipt !== false
    const showFooter = userProfile?.show_footer_section !== false
    const showPoweredBy = userProfile?.show_powered_by_airoxlab !== false

    // Header section
    receipt += '\n\n' // Top padding

    // Add store logo if available and enabled
    if (showLogo && cachedAssets.logo) {
      receipt += `[LOGO:${cachedAssets.logo}]\n\n`
    }

    if (showBusinessName) {
      receipt += this.centerLine(userProfile?.store_name || '')
    }
    if (userProfile?.store_address) {
      receipt += this.centerLine(userProfile.store_address)
    }
    const phone = userProfile?.phone || ''
    const phone2 = userProfile?.phone_secondary || ''
    const phoneStr = [phone, phone2].filter(Boolean).join(' | ')
    if (phoneStr) {
      receipt += this.centerLine(`Ph: ${phoneStr}`)
    }
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
      const customerName = orderData.customer.full_name || orderData.customer.name ||
        [orderData.customer.first_name, orderData.customer.last_name].filter(Boolean).join(' ') || ''
      if (customerName) receipt += this.leftRight('Customer:', customerName)
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
    ;(orderData.cart || []).forEach(item => {
      let itemName = item.isDeal ? item.dealName : item.productName
      if (!item.isDeal && item.variantName) {
        itemName += ` (${item.variantName})`
      }
      const gross = parseFloat(item.finalPrice) * item.quantity
      const discAmt = parseFloat(item.itemDiscountAmount) > 0
        ? parseFloat(item.itemDiscountAmount)
        : Math.max(0, gross - parseFloat(item.totalPrice))
      const hasDiscount = discAmt >= 0.01

      const itemLine = `${item.quantity}x ${itemName}`
      // Show original gross; if discounted, the deduction line below clarifies the net
      receipt += this.wrapItem(itemLine, this.formatCurrency(hasDiscount ? gross : item.totalPrice))

      if (hasDiscount) {
        const pct = (discAmt / gross * 100).toFixed(0)
        let discLabel
        if (item.itemDiscountType === 'percentage') {
          discLabel = `  Discount (${pct}%)`
        } else if (item.itemDiscountType === 'fixed') {
          discLabel = `  Discount (Rs ${discAmt.toFixed(0)} off)`
        } else {
          discLabel = `  Discount (${pct}%)`
        }
        receipt += this.wrapItem(discLabel, `-${this.formatCurrency(discAmt)}`)
      }
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

    // Footer section (QR + review message + hashtags)
    if (showFooter) {
      receipt += '\n'
      if (cachedAssets.qrCode) {
        receipt += `[QR:${cachedAssets.qrCode}]\n`
        receipt += '\n'
      }
      const reviewMsg = userProfile?.receipt_review_message
      if (reviewMsg) {
        receipt += this.centerLine(reviewMsg)
      }
      const h1 = userProfile?.hashtag1 || ''
      const h2 = userProfile?.hashtag2 || ''
      const hashtagLine = [h1, h2].filter(Boolean).join(' ')
      if (hashtagLine) {
        receipt += this.centerLine(hashtagLine)
      }
    }

    // Thank-you message (separate from footer section toggle)
    const footerMsg = userProfile?.receipt_footer_message
    if (footerMsg) {
      receipt += '\n'
      receipt += this.centerLine(footerMsg)
    }

    receipt += this.paddedLine('='.repeat(this.CPL - this.LEFT_PAD.length))
    receipt += '\n'
    if (showPoweredBy) {
      receipt += this.centerLine('Powered by airoxlab.com')
    }

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