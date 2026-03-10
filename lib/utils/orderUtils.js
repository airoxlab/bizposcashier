// Order utility functions
import ReceiptFormatter from './receiptFormatter'

export const generateOrderNumber = () => {
  const timestamp = Date.now().toString().slice(-6)
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `ORD${timestamp}${random}`
}

export const calculateOrderTotals = (cartItems, discountPercentage = 0) => {
  const subtotal = cartItems.reduce((sum, item) => sum + item.totalPrice, 0)
  const discountAmount = (subtotal * discountPercentage) / 100
  const total = subtotal - discountAmount
  
  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    discountAmount: parseFloat(discountAmount.toFixed(2)),
    total: parseFloat(total.toFixed(2))
  }
}

export const formatCurrency = (amount) => {
  return `Rs ${parseFloat(amount).toFixed(2)}`
}

export const formatOrderTime = (date) => {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
}

export const formatOrderDate = (date) => {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export const playNotificationSound = (type = 'beep') => {
  try {
    const audio = new Audio(`/sounds/${type}.mp3`)
    audio.volume = 0.5
    audio.play().catch(console.error)
  } catch (error) {
    console.warn('Could not play notification sound:', error)
  }
}

export const printReceipt = async (orderData) => {
  try {
    console.log('🖨️ [PrintReceipt] Printing receipt for order:', orderData.orderNumber)

    // Get user profile from localStorage
    const userProfile = JSON.parse(localStorage.getItem('user_profile') || '{}')

    // Create receipt formatter instance
    const formatter = new ReceiptFormatter()

    // Prepare order data for formatter
    const formattedOrderData = {
      orderNumber: orderData.orderNumber,
      orderType: orderData.orderType,
      customer: orderData.customer,
      cart: orderData.items || orderData.cart,
      subtotal: orderData.subtotal,
      discountAmount: orderData.discountAmount || 0,
      deliveryCharges: orderData.deliveryCharges || 0,
      total: orderData.total || orderData.totalAmount,
      totalAmount: orderData.total || orderData.totalAmount,
      paymentMethod: orderData.paymentMethod,
      cashReceived: orderData.cashReceived,
      change: orderData.change,
      orderInstructions: orderData.orderInstructions
    }

    // Generate receipt text (includes cached logo and QR code placeholders)
    const receiptText = formatter.generateReceipt(formattedOrderData, userProfile, null)

    // Convert to HTML (replaces placeholders with actual base64 images)
    const receiptHTML = formatter.convertToHTML(receiptText)

    // Open print dialog
    const printWindow = window.open('', '_blank')
    printWindow.document.write(receiptHTML)
    printWindow.document.close()
    printWindow.print()

    console.log('✅ [PrintReceipt] Receipt printed successfully')
  } catch (error) {
    console.error('❌ [PrintReceipt] Failed to print receipt:', error)
    throw error
  }
}