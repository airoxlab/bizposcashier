// // lib/utils/advancedReceiptFormatter.js
// export class AdvancedReceiptFormatter {
//   constructor() {
//     this.CPL = 42 // Characters per line for 80mm paper
//     this.LEFT_PAD = '  ' // 2 spaces for left margin
    
//     // ESC/POS commands
//     this.ESC = 0x1B
//     this.GS = 0x1D
    
//     // Command buffers
//     this.commands = {
//       init: Buffer.from([this.ESC, 0x40]),
//       fontA: Buffer.from([this.ESC, 0x4D, 0x00]),
//       fontB: Buffer.from([this.ESC, 0x4D, 0x01]),
//       alignLeft: Buffer.from([this.ESC, 0x61, 0x00]),
//       alignCenter: Buffer.from([this.ESC, 0x61, 0x01]),
//       alignRight: Buffer.from([this.ESC, 0x61, 0x02]),
//       bold: Buffer.from([this.ESC, 0x45, 0x01]),
//       boldOff: Buffer.from([this.ESC, 0x45, 0x00]),
//       underline: Buffer.from([this.ESC, 0x2D, 0x01]),
//       underlineOff: Buffer.from([this.ESC, 0x2D, 0x00]),
//       doubleHeight: Buffer.from([this.ESC, 0x21, 0x10]),
//       doubleWidth: Buffer.from([this.ESC, 0x21, 0x20]),
//       normalSize: Buffer.from([this.ESC, 0x21, 0x00]),
//       leftMargin0: Buffer.from([this.GS, 0x4C, 0x00, 0x00]),
//       width512: Buffer.from([this.GS, 0x57, 0x00, 0x02]),
//       lf: Buffer.from([0x0A]),
//       cutPartial: Buffer.from([this.GS, 0x56, 0x01]),
//       cutFull: Buffer.from([this.GS, 0x56, 0x00])
//     }
//   }

//   // Generate complete receipt with proper ESC/POS commands
//   generateReceiptBuffer(orderData, userProfile, printer) {
//     const chunks = []
    
//     // Initialize printer
//     chunks.push(this.commands.init)
//     chunks.push(this.commands.fontA)
//     chunks.push(this.commands.alignLeft)
//     chunks.push(this.commands.leftMargin0)
//     chunks.push(this.commands.width512)

//     // Header section
//     chunks.push(this.commands.lf, this.commands.lf) // Top padding
    
//     // Store name (bold, double height)
//     chunks.push(this.commands.alignCenter)
//     chunks.push(this.commands.bold)
//     chunks.push(this.commands.doubleHeight)
//     chunks.push(Buffer.from(userProfile.store_name || 'GEN Z CAFE', 'ascii'))
//     chunks.push(this.commands.lf)
//     chunks.push(this.commands.normalSize)
//     chunks.push(this.commands.boldOff)

//     // Store address and phone
//     chunks.push(Buffer.from(userProfile.store_address || 'Gulshan e Madina, Jhang Road', 'ascii'))
//     chunks.push(this.commands.lf)
//     chunks.push(Buffer.from(`Bhakkar | Ph: ${userProfile.phone || '0310-1731573'}`, 'ascii'))
//     chunks.push(this.commands.lf, this.commands.lf)

//     // Receipt header
//     chunks.push(this.commands.alignLeft)
//     chunks.push(Buffer.from(this.LEFT_PAD + '='.repeat(this.CPL - this.LEFT_PAD.length), 'ascii'))
//     chunks.push(this.commands.lf)
//     chunks.push(this.commands.alignCenter)
//     chunks.push(this.commands.bold)
//     chunks.push(Buffer.from('ORDER RECEIPT', 'ascii'))
//     chunks.push(this.commands.boldOff)
//     chunks.push(this.commands.lf)
//     chunks.push(this.commands.alignLeft)
//     chunks.push(Buffer.from(this.LEFT_PAD + '='.repeat(this.CPL - this.LEFT_PAD.length), 'ascii'))
//     chunks.push(this.commands.lf)

//     // Order details
//     const { date, time } = this.formatDateTime()
//     chunks.push(Buffer.from(this.leftRight('Invoice:', orderData.orderNumber || '#001'), 'ascii'))
//     chunks.push(this.commands.lf)
//     chunks.push(Buffer.from(this.leftRight('Date:', date), 'ascii'))
//     chunks.push(this.commands.lf)
//     chunks.push(Buffer.from(this.leftRight('Time:', time), 'ascii'))
//     chunks.push(this.commands.lf)
    
//     // Customer info
//     if (orderData.customer) {
//       chunks.push(Buffer.from(this.leftRight('Customer:', `${orderData.customer.first_name} ${orderData.customer.last_name}`), 'ascii'))
//       chunks.push(this.commands.lf)
//       if (orderData.customer.phone) {
//         chunks.push(Buffer.from(this.leftRight('Phone:', orderData.customer.phone), 'ascii'))
//         chunks.push(this.commands.lf)
//       }
//     }
    
//     chunks.push(Buffer.from(this.leftRight('Type:', orderData.orderType?.toUpperCase() || 'WALK-IN'), 'ascii'))
//     chunks.push(this.commands.lf, this.commands.lf)

//     // Items section
//     chunks.push(Buffer.from(this.LEFT_PAD + '-'.repeat(this.CPL - this.LEFT_PAD.length), 'ascii'))
//     chunks.push(this.commands.lf)
//     chunks.push(this.commands.bold)
//     chunks.push(Buffer.from(this.leftRight('ITEM', 'AMOUNT'), 'ascii'))
//     chunks.push(this.commands.boldOff)
//     chunks.push(this.commands.lf)
//     chunks.push(Buffer.from(this.LEFT_PAD + '-'.repeat(this.CPL - this.LEFT_PAD.length), 'ascii'))
//     chunks.push(this.commands.lf)

//     // Order items
//     orderData.cart.forEach(item => {
//       let itemName = `${item.quantity}x ${item.productName}`
//       if (item.variantName) {
//         itemName += ` (${item.variantName})`
//       }
      
//       const itemLines = this.wrapItem(itemName, this.formatCurrency(item.totalPrice))
//       chunks.push(Buffer.from(itemLines, 'ascii'))
//     })

//     // Totals section
//     chunks.push(Buffer.from(this.LEFT_PAD + '-'.repeat(this.CPL - this.LEFT_PAD.length), 'ascii'))
//     chunks.push(this.commands.lf)
    
//     chunks.push(Buffer.from(this.leftRight('SUBTOTAL', this.formatCurrency(orderData.subtotal)), 'ascii'))
//     chunks.push(this.commands.lf)
    
//     if (orderData.discountAmount > 0) {
//       chunks.push(Buffer.from(this.leftRight('DISCOUNT', `-${this.formatCurrency(orderData.discountAmount)}`), 'ascii'))
//       chunks.push(this.commands.lf)
//     }
    
//     chunks.push(this.commands.bold)
//     chunks.push(this.commands.doubleHeight)
//     chunks.push(Buffer.from(this.leftRight('GRAND TOTAL', this.formatCurrency(orderData.total)), 'ascii'))
//     chunks.push(this.commands.normalSize)
//     chunks.push(this.commands.boldOff)
//     chunks.push(this.commands.lf, this.commands.lf)

//     // Payment information
//     chunks.push(Buffer.from(this.leftRight('PAYMENT METHOD', orderData.paymentMethod?.toUpperCase() || 'CASH'), 'ascii'))
//     chunks.push(this.commands.lf)
    
//     if (orderData.paymentMethod === 'Cash' && orderData.cashReceived) {
//       chunks.push(Buffer.from(this.leftRight('CASH RECEIVED', this.formatCurrency(orderData.cashReceived)), 'ascii'))
//       chunks.push(this.commands.lf)
//       if (orderData.change > 0) {
//         chunks.push(Buffer.from(this.leftRight('CHANGE', this.formatCurrency(orderData.change)), 'ascii'))
//         chunks.push(this.commands.lf)
//       }
//     }
    
//     chunks.push(this.commands.lf)
//     chunks.push(this.commands.alignCenter)
//     chunks.push(this.commands.bold)
//     chunks.push(Buffer.from('* PAID *', 'ascii'))
//     chunks.push(this.commands.boldOff)
//     chunks.push(this.commands.lf)

//     // Special instructions
//     if (orderData.orderInstructions) {
//       chunks.push(this.commands.lf)
//       chunks.push(this.commands.alignLeft)
//       chunks.push(Buffer.from(this.paddedLine('INSTRUCTIONS:'), 'ascii'))
//       chunks.push(Buffer.from(this.paddedLine(orderData.orderInstructions), 'ascii'))
//     }

//     // Footer
//     chunks.push(this.commands.lf)
//     chunks.push(this.commands.alignCenter)
//     chunks.push(Buffer.from('Thanks for visiting!', 'ascii'))
//     chunks.push(this.commands.lf)
//     chunks.push(Buffer.from('See you soon!', 'ascii'))
//     chunks.push(this.commands.lf)
//     chunks.push(this.commands.alignLeft)
//     chunks.push(Buffer.from(this.LEFT_PAD + '='.repeat(this.CPL - this.LEFT_PAD.length), 'ascii'))
//     chunks.push(this.commands.lf, this.commands.lf)
//     chunks.push(this.commands.alignCenter)
//     chunks.push(Buffer.from('Powered by ibexcodes.com', 'ascii'))

//     // Extra feed for safe cut
//     chunks.push(this.commands.lf, this.commands.lf, this.commands.lf, this.commands.lf)
//     chunks.push(this.commands.cutPartial)

//     return Buffer.concat(chunks)
//   }

//   // Helper methods
//   paddedLine(text = '') {
//     return this.LEFT_PAD + text + '\n'
//   }

//   centerLine(text) {
//     const printableWidth = this.CPL - this.LEFT_PAD.length
//     const pad = Math.floor((printableWidth - text.length) / 2)
//     const centered = ' '.repeat(Math.max(0, pad)) + text
//     return this.paddedLine(centered)
//   }

//   leftRight(left, right) {
//     const printableWidth = this.CPL - this.LEFT_PAD.length
//     let spaces = printableWidth - left.length - right.length
//     if (spaces < 1) spaces = 1
//     return this.LEFT_PAD + left + ' '.repeat(spaces) + right
//   }

//   wrapItem(name, amount, rightCol = 10) {
//     const printableWidth = this.CPL - this.LEFT_PAD.length
//     const leftCol = printableWidth - rightCol
//     const words = name.split(/\s+/)
//     const lines = []
//     let row = ''

//     for (const word of words) {
//       const next = row ? row + ' ' + word : word
//       if (next.length <= leftCol) {
//         row = next
//       } else {
//         if (row) lines.push(row)
//         row = word
//       }
//     }
//     if (row) lines.push(row)

//     let result = ''
//     lines.forEach((txt, i) => {
//       if (i === 0) {
//         result += this.LEFT_PAD + txt.padEnd(leftCol, ' ') + amount.padStart(rightCol, ' ') + '\n'
//       } else {
//         result += this.LEFT_PAD + txt + '\n'
//       }
//     })
//     return result
//   }

//   formatCurrency(amount) {
//     return `Rs ${parseFloat(amount).toFixed(2)}`
//   }

//   formatDateTime() {
//     const now = new Date()
//     const options = { 
//       weekday: 'short', 
//       year: 'numeric', 
//       month: 'short', 
//       day: 'numeric' 
//     }
//     const date = now.toLocaleDateString('en-US', options)
//     const time = now.toLocaleTimeString('en-US', { 
//       hour: '2-digit', 
//       minute: '2-digit',
//       hour12: true 
//     })
    
//     return { date, time }
//   }
// }

// export default AdvancedReceiptFormatter