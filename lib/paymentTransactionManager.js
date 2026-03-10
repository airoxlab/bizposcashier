/**
 * Payment Transaction Manager
 * Handles multi-payment transactions, split payments, and partial payments
 */

import { supabase } from './supabase'

class PaymentTransactionManager {
  /**
   * Process a single payment transaction
   * @param {string} orderId - Order ID
   * @param {string} userId - User ID
   * @param {string} paymentMethod - Payment method (Cash, EasyPaisa, JazzCash, Bank, Account)
   * @param {number} amount - Payment amount
   * @param {string} referenceNumber - Optional reference number
   * @param {string} notes - Optional notes
   * @param {string} recordedBy - User ID of person recording payment
   * @returns {Promise<object>} Result object
   */
  async processPayment(orderId, userId, paymentMethod, amount, referenceNumber = null, notes = null, recordedBy = null) {
    try {
      console.log('💳 Processing payment:', {
        orderId,
        userId,
        paymentMethod,
        amount,
        referenceNumber,
        recordedBy
      })

      // Call database function
      const { data, error } = await supabase.rpc('process_order_payment', {
        p_order_id: orderId,
        p_user_id: userId,
        p_payment_method: paymentMethod,
        p_amount: amount,
        p_reference_number: referenceNumber,
        p_notes: notes,
        p_recorded_by: recordedBy
      })

      if (error) {
        console.error('❌ Payment processing error:', error)
        console.error('❌ Error details:', JSON.stringify(error, null, 2))
        console.error('❌ Error message:', error.message)
        console.error('❌ Error code:', error.code)
        throw new Error(error.message || 'Database function call failed')
      }

      console.log('💳 RPC Response:', data)
      console.log('💳 RPC Response type:', typeof data)

      if (!data) {
        throw new Error('No response from database function')
      }

      const result = typeof data === 'string' ? JSON.parse(data) : data
      console.log('💳 Parsed result:', result)

      if (!result || !result.success) {
        const errorMsg = result?.error || 'Payment processing failed'
        console.error('❌ Payment failed:', errorMsg)
        throw new Error(errorMsg)
      }

      console.log('✅ Payment processed successfully:', result)
      return result

    } catch (error) {
      console.error('❌ Payment transaction error:', error)
      console.error('❌ Full error object:', JSON.stringify(error, null, 2))
      throw error
    }
  }

  /**
   * Process multiple payments (split payment)
   * @param {string} orderId - Order ID
   * @param {string} userId - User ID
   * @param {Array} payments - Array of payment objects [{method, amount, reference, notes}]
   * @param {string} recordedBy - User ID of person recording payment
   * @returns {Promise<object>} Result object with all transaction IDs
   */
  async processSplitPayment(orderId, userId, payments, recordedBy = null) {
    try {
      console.log('💳💳 Processing split payment:', {
        orderId,
        paymentCount: payments.length,
        totalAmount: payments.reduce((sum, p) => sum + p.amount, 0)
      })

      const results = []
      let finalResult = null

      // Process each payment sequentially
      for (const payment of payments) {
        const result = await this.processPayment(
          orderId,
          userId,
          payment.method,
          payment.amount,
          payment.reference,
          payment.notes,
          recordedBy
        )
        results.push(result)
        finalResult = result // Keep last result for final status
      }

      console.log('✅ Split payment processed successfully')
      return {
        success: true,
        transactions: results,
        payment_status: finalResult.payment_status,
        amount_paid: finalResult.amount_paid,
        amount_due: finalResult.amount_due
      }

    } catch (error) {
      console.error('❌ Split payment error:', error)
      throw error
    }
  }

  /**
   * Get payment summary for an order
   * @param {string} orderId - Order ID
   * @returns {Promise<object>} Payment summary
   */
  async getPaymentSummary(orderId) {
    try {
      const { data, error } = await supabase.rpc('get_order_payment_summary', {
        p_order_id: orderId
      })

      if (error) {
        console.error('❌ Error fetching payment summary:', error)
        throw error
      }

      const result = typeof data === 'string' ? JSON.parse(data) : data

      if (!result.success) {
        throw new Error(result.error || 'Failed to get payment summary')
      }

      return result

    } catch (error) {
      console.error('❌ Payment summary error:', error)
      throw error
    }
  }

  /**
   * Get all payment transactions for an order
   * @param {string} orderId - Order ID
   * @returns {Promise<Array>} Array of payment transactions
   */
  async getOrderTransactions(orderId) {
    try {
      const { data, error } = await supabase
        .from('order_payment_transactions')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('❌ Error fetching transactions:', error)
        throw error
      }

      return data || []

    } catch (error) {
      console.error('❌ Transaction fetch error:', error)
      return []
    }
  }

  /**
   * Update order payment method to 'Split' if multiple payment methods used
   * @param {string} orderId - Order ID
   * @returns {Promise<boolean>}
   */
  async updateOrderPaymentMethodToSplit(orderId) {
    try {
      // Get all transactions for this order
      const transactions = await this.getOrderTransactions(orderId)

      // Get unique payment methods
      const uniqueMethods = [...new Set(transactions.map(t => t.payment_method))]

      // If more than one payment method, update order to 'Split'
      if (uniqueMethods.length > 1) {
        const { error } = await supabase
          .from('orders')
          .update({ payment_method: 'Split' })
          .eq('id', orderId)

        if (error) {
          console.error('❌ Error updating payment method:', error)
          return false
        }

        console.log('✅ Order payment method updated to Split')
        return true
      }

      return false

    } catch (error) {
      console.error('❌ Error updating payment method:', error)
      return false
    }
  }

  /**
   * Calculate remaining amount due for an order
   * @param {object} order - Order object
   * @returns {number} Amount due
   */
  calculateAmountDue(order) {
    if (!order) return 0
    const totalAmount = parseFloat(order.total_amount) || 0
    const amountPaid = parseFloat(order.amount_paid) || 0
    return Math.max(0, totalAmount - amountPaid)
  }

  /**
   * Check if order is fully paid
   * @param {object} order - Order object
   * @returns {boolean}
   */
  isFullyPaid(order) {
    if (!order) return false
    return this.calculateAmountDue(order) < 0.01 // Allow 1 cent tolerance
  }

  /**
   * Check if order has partial payment
   * @param {object} order - Order object
   * @returns {boolean}
   */
  hasPartialPayment(order) {
    if (!order) return false
    const amountPaid = parseFloat(order.amount_paid) || 0
    return amountPaid > 0 && !this.isFullyPaid(order)
  }

  /**
   * Get payment status badge info
   * @param {object} order - Order object
   * @returns {object} Badge info {color, text, icon}
   */
  getPaymentStatusBadge(order) {
    if (!order) {
      return { color: 'gray', text: 'Unknown', icon: 'AlertTriangle' }
    }

    const paymentStatus = order.payment_status

    const statusMap = {
      'Paid': { color: 'green', text: 'Paid', icon: 'CheckCircle' },
      'Partial': { color: 'yellow', text: 'Partial', icon: 'Clock' },
      'Pending': { color: 'red', text: 'Unpaid', icon: 'AlertTriangle' },
      'Refunded': { color: 'purple', text: 'Refunded', icon: 'RotateCcw' }
    }

    return statusMap[paymentStatus] || { color: 'gray', text: paymentStatus, icon: 'HelpCircle' }
  }

  /**
   * Format payment method display name
   * @param {string} method - Payment method
   * @returns {string} Display name
   */
  getPaymentMethodDisplay(method) {
    const methodMap = {
      'Cash': '💵 Cash',
      'EasyPaisa': '📱 EasyPaisa',
      'JazzCash': '📱 JazzCash',
      'Bank': '🏦 Meezan Bank',
      'Account': '👤 Account',
      'Split': '🔀 Split Payment',
      'Unpaid': '⏳ Unpaid'
    }

    return methodMap[method] || method
  }
}

// Export singleton instance
const paymentTransactionManager = new PaymentTransactionManager()
export default paymentTransactionManager
