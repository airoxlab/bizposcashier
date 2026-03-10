# Multi-Payment System - Usage Examples

This guide shows practical examples of how to use the new multi-payment system in different parts of your POS application.

---

## 📱 Example 1: Adding "Collect Payment" Button to Orders Page

This example shows how to add a payment collection button in your orders list for unpaid/partially paid orders.

### Code Integration

```javascript
// In your app/orders/page.js or equivalent

import { useState } from 'react'
import paymentTransactionManager from '@/lib/paymentTransactionManager'
import SplitPaymentModal from '@/components/pos/SplitPaymentModal'
import { notify } from '@/components/ui/NotificationSystem'
import { supabase } from '@/lib/supabase'

export default function OrdersPage() {
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState(null)

  // Handle collect payment button click
  const handleCollectPayment = (order) => {
    setSelectedOrderForPayment(order)
    setShowPaymentModal(true)
  }

  // Handle payment completion
  const handlePaymentComplete = async (payments) => {
    try {
      const user = authManager.getCurrentUser()

      // Process the payment(s)
      const result = await paymentTransactionManager.processSplitPayment(
        selectedOrderForPayment.id,
        user.id,
        payments,
        user.id // recorded_by
      )

      if (result.success) {
        notify.success(`Payment collected! Amount paid: Rs ${result.amount_paid.toFixed(2)}`)

        // If multiple payment methods, update to 'Split'
        if (payments.length > 1) {
          await paymentTransactionManager.updateOrderPaymentMethodToSplit(selectedOrderForPayment.id)
        }

        // Refresh orders list
        fetchOrders()

        // Close modal
        setShowPaymentModal(false)
      }
    } catch (error) {
      notify.error(`Payment failed: ${error.message}`)
    }
  }

  // In your order card JSX
  return (
    <>
      {orders.map(order => {
        const amountDue = paymentTransactionManager.calculateAmountDue(order)
        const paymentBadge = paymentTransactionManager.getPaymentStatusBadge(order)

        return (
          <div key={order.id} className="order-card">
            {/* ... existing order card content ... */}

            {/* Payment Status Badge */}
            <div className={`px-2 py-1 rounded-full text-xs font-semibold bg-${paymentBadge.color}-100 text-${paymentBadge.color}-700`}>
              {paymentBadge.text}
            </div>

            {/* Show amount due if not fully paid */}
            {amountDue > 0 && (
              <div className="text-sm text-red-600 font-medium">
                Due: Rs {amountDue.toFixed(2)}
              </div>
            )}

            {/* Collect Payment Button (only if amount due > 0) */}
            {amountDue > 0 && (
              <button
                onClick={() => handleCollectPayment(order)}
                className="px-3 py-1 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
              >
                Collect Payment
              </button>
            )}
          </div>
        )
      })}

      {/* Payment Modal */}
      <SplitPaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        totalAmount={selectedOrderForPayment?.total_amount || 0}
        amountDue={paymentTransactionManager.calculateAmountDue(selectedOrderForPayment)}
        onPaymentComplete={handlePaymentComplete}
        customer={selectedOrderForPayment?.customers}
        title="Collect Payment"
      />
    </>
  )
}
```

---

## 🎯 Example 2: Partial Payment at Order Creation

Allow customers to pay part of the order when placing it, with the rest to be paid later.

### At Payment Page

```javascript
// In your app/payment/page.js

import { useState } from 'react'
import SplitPaymentModal from '@/components/pos/SplitPaymentModal'
import paymentTransactionManager from '@/lib/paymentTransactionManager'

export default function PaymentPage() {
  const [orderData, setOrderData] = useState(null) // From localStorage
  const [showPartialPaymentModal, setShowPartialPaymentModal] = useState(false)
  const [partialPaymentAmount, setPartialPaymentAmount] = useState(0)

  // User clicks "Partial Payment" button
  const handlePartialPayment = () => {
    setShowPartialPaymentModal(true)
  }

  // Process order with partial payment
  const processOrderWithPartialPayment = async (payments) => {
    try {
      // 1. Create order first (with payment_status = 'Pending')
      const { data: order, error } = await supabase
        .from('orders')
        .insert({
          user_id: user.id,
          customer_id: orderData.customer?.id,
          order_type: orderData.orderType,
          subtotal: orderData.subtotal,
          total_amount: orderData.total,
          payment_method: payments.length > 1 ? 'Split' : payments[0].method,
          payment_status: 'Pending', // Will be updated by trigger
          order_status: 'Pending',
          amount_paid: 0 // Will be updated by trigger
        })
        .select()
        .single()

      if (error) throw error

      // 2. Insert order items
      // ... (your existing order items insertion logic)

      // 3. Process payment transactions
      const paymentResult = await paymentTransactionManager.processSplitPayment(
        order.id,
        user.id,
        payments,
        user.id
      )

      if (paymentResult.success) {
        notify.success(`Order created! Paid: Rs ${paymentResult.amount_paid}, Due: Rs ${paymentResult.amount_due}`)

        // Redirect to success page
        router.push('/order-success')
      }
    } catch (error) {
      notify.error(`Order creation failed: ${error.message}`)
    }
  }

  return (
    <div>
      {/* ... existing payment UI ... */}

      {/* Add Partial Payment Button */}
      <button
        onClick={handlePartialPayment}
        className="px-6 py-3 bg-yellow-600 text-white rounded-lg font-medium"
      >
        Partial Payment
      </button>

      {/* Partial Payment Modal */}
      <SplitPaymentModal
        isOpen={showPartialPaymentModal}
        onClose={() => setShowPartialPaymentModal(false)}
        totalAmount={orderData?.total || 0}
        amountDue={orderData?.total || 0}
        onPaymentComplete={processOrderWithPartialPayment}
        customer={orderData?.customer}
        title="Partial Payment"
      />
    </div>
  )
}
```

---

## 💰 Example 3: Collect Remaining on Order Completion

When marking an order as complete, check if there's an outstanding balance and collect it.

### At Walkin/Takeaway/Delivery Pages

```javascript
// In your complete order handler

const handleCompleteOrder = async (order) => {
  try {
    // Check if there's amount due
    const amountDue = paymentTransactionManager.calculateAmountDue(order)

    if (amountDue > 0) {
      // Show modal to collect remaining payment
      const collectPayment = confirm(
        `This order has Rs ${amountDue.toFixed(2)} due. Collect payment now?`
      )

      if (collectPayment) {
        // Show payment modal
        setSelectedOrderForPayment(order)
        setShowPaymentModal(true)
        return // Don't complete yet, wait for payment
      } else {
        // User chose to complete without payment
        const moveToAccount = confirm(
          'Move remaining amount to customer account?'
        )

        if (moveToAccount && order.customer_id) {
          // Create account payment transaction
          await paymentTransactionManager.processPayment(
            order.id,
            user.id,
            'Account',
            amountDue,
            null,
            'Moved to account on order completion',
            user.id
          )
        }
      }
    }

    // Mark order as complete
    const { error } = await supabase
      .from('orders')
      .update({
        order_status: 'Completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', order.id)

    if (error) throw error

    notify.success('Order completed successfully!')
    fetchOrders()

  } catch (error) {
    notify.error(`Failed to complete order: ${error.message}`)
  }
}
```

---

## 📊 Example 4: Display Payment History

Show all payment transactions for an order.

```javascript
import { useState, useEffect } from 'react'
import paymentTransactionManager from '@/lib/paymentTransactionManager'

function OrderPaymentHistory({ orderId }) {
  const [paymentSummary, setPaymentSummary] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPaymentSummary()
  }, [orderId])

  const loadPaymentSummary = async () => {
    try {
      setLoading(true)
      const summary = await paymentTransactionManager.getPaymentSummary(orderId)
      setPaymentSummary(summary)
    } catch (error) {
      console.error('Failed to load payment summary:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div>Loading payment history...</div>

  if (!paymentSummary) return <div>No payment data</div>

  return (
    <div className="payment-history">
      <h3 className="text-lg font-bold mb-4">Payment History</h3>

      {/* Summary */}
      <div className="bg-gray-50 rounded-lg p-4 mb-4">
        <div className="flex justify-between mb-2">
          <span>Total Amount:</span>
          <span className="font-bold">Rs {paymentSummary.total_amount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between mb-2">
          <span>Amount Paid:</span>
          <span className="font-bold text-green-600">Rs {paymentSummary.amount_paid.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Amount Due:</span>
          <span className={`font-bold ${paymentSummary.amount_due > 0 ? 'text-red-600' : 'text-green-600'}`}>
            Rs {paymentSummary.amount_due.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Transactions */}
      <div className="space-y-2">
        <h4 className="font-semibold text-sm text-gray-600">Transactions</h4>
        {paymentSummary.transactions && paymentSummary.transactions.length > 0 ? (
          paymentSummary.transactions.map((txn, index) => (
            <div key={txn.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
              <div className="flex-1">
                <div className="font-medium">
                  {paymentTransactionManager.getPaymentMethodDisplay(txn.payment_method)}
                </div>
                <div className="text-xs text-gray-500">
                  {new Date(txn.created_at).toLocaleString()}
                </div>
                {txn.reference_number && (
                  <div className="text-xs text-gray-500">
                    Ref: {txn.reference_number}
                  </div>
                )}
                {txn.notes && (
                  <div className="text-xs text-gray-600 mt-1">
                    Note: {txn.notes}
                  </div>
                )}
              </div>
              <div className="text-lg font-bold text-green-600">
                Rs {txn.amount.toFixed(2)}
              </div>
            </div>
          ))
        ) : (
          <div className="text-sm text-gray-500">No payments recorded yet</div>
        )}
      </div>
    </div>
  )
}

export default OrderPaymentHistory
```

---

## 🔄 Example 5: Customer Account Payment with Ledger Tracking

Allow customers to pay via their account, automatically updating their ledger.

```javascript
// This happens automatically when using 'Account' payment method!

const handleAccountPayment = async (orderId, amount, customer) => {
  try {
    const user = authManager.getCurrentUser()

    // Process account payment
    const result = await paymentTransactionManager.processPayment(
      orderId,
      user.id,
      'Account', // This triggers automatic ledger entry
      amount,
      null,
      `Payment for order via customer account`,
      user.id
    )

    if (result.success) {
      notify.success('Payment recorded to customer account')

      // Fetch updated customer balance
      const { data: updatedCustomer } = await supabase
        .from('customers')
        .select('account_balance')
        .eq('id', customer.id)
        .single()

      console.log('Updated customer balance:', updatedCustomer.account_balance)
    }
  } catch (error) {
    notify.error(`Account payment failed: ${error.message}`)
  }
}
```

---

## 🎨 Example 6: Styling Payment Status Badges

Use the helper functions to display consistent payment status indicators.

```javascript
import paymentTransactionManager from '@/lib/paymentTransactionManager'

function PaymentStatusBadge({ order }) {
  const badge = paymentTransactionManager.getPaymentStatusBadge(order)

  const colorClasses = {
    green: 'bg-green-100 text-green-700 border-green-200',
    yellow: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    red: 'bg-red-100 text-red-700 border-red-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200',
    gray: 'bg-gray-100 text-gray-700 border-gray-200'
  }

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${colorClasses[badge.color]}`}>
      {badge.text}
    </span>
  )
}

// Usage
<PaymentStatusBadge order={selectedOrder} />
```

---

## 📝 Notes

### Account Payment Best Practices

1. **Always verify customer exists** before allowing account payments
2. **Set credit limits** in the `customers.credit_limit` field
3. **Check balance before allowing more credit**:
   ```javascript
   if (customer.account_balance + amount > customer.credit_limit) {
     notify.error('Customer has exceeded credit limit')
     return
   }
   ```

### Split Payment Best Practices

1. **Validate total matches** before processing
2. **Show running total** as user adds payment methods
3. **Allow editing** individual payment lines
4. **Confirm before submission** to avoid mistakes

### Backward Compatibility

- Old orders without payment transactions will still work
- `orders.amount_paid` defaults to 0 for old orders
- `amount_due` is calculated dynamically
- No data migration required!

---

**Last Updated:** 2026-01-24
