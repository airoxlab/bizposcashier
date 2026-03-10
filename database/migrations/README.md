# Multi-Payment System Implementation Guide

## Overview

This implementation adds comprehensive payment handling to your POS system, supporting:

- ✅ **Partial Payments** - Accept partial payments at order creation and completion
- ✅ **Split Payments** - Accept multiple payment methods for a single order (e.g., Rs 500 Cash + Rs 1000 Account)
- ✅ **Account/Credit Payments** - Allow customers to pay via their account balance (tracked in customer ledger)
- ✅ **Payment History** - Track all payment transactions per order
- ✅ **Backward Compatible** - Existing orders remain unaffected

---

## 📋 Implementation Steps

### Step 1: Run Database Migration

Execute the SQL migration to create the new payment infrastructure:

```bash
# Connect to your Supabase database or PostgreSQL instance
psql -U your_username -d your_database -f database/migrations/001_create_order_payment_transactions.sql
```

**Or via Supabase Dashboard:**
1. Go to SQL Editor in Supabase Dashboard
2. Open `database/migrations/001_create_order_payment_transactions.sql`
3. Copy and paste the entire contents
4. Click "Run"

**What this migration does:**
- Creates `order_payment_transactions` table
- Adds 'Account' and 'Split' to payment method constraints
- Creates `process_order_payment()` function
- Creates `get_order_payment_summary()` function
- Creates triggers to auto-update `orders.amount_paid`

---

### Step 2: Verify Migration Success

Run this query to verify everything was created:

```sql
-- Check table exists
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'order_payment_transactions';

-- Check functions exist
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('process_order_payment', 'get_order_payment_summary');

-- Check constraints updated
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name LIKE '%payment_method%';
```

Expected results:
- ✅ `order_payment_transactions` table exists
- ✅ 2 functions created
- ✅ Payment method constraints include 'Account' and 'Split'

---

### Step 3: Update Your Application Code

#### A. Import the Payment Transaction Manager

In any component where you need payment functionality:

```javascript
import paymentTransactionManager from '@/lib/paymentTransactionManager'
import SplitPaymentModal from '@/components/pos/SplitPaymentModal'
```

#### B. Example: Split Payment on Order Completion

```javascript
const [showPaymentModal, setShowPaymentModal] = useState(false)
const [selectedOrder, setSelectedOrder] = useState(null)

// When user clicks "Complete Order" button
const handleCompleteOrder = async (order) => {
  // Check if order has amount due
  const amountDue = paymentTransactionManager.calculateAmountDue(order)

  if (amountDue > 0) {
    // Show payment modal
    setSelectedOrder(order)
    setShowPaymentModal(true)
  } else {
    // Already paid, just complete
    await completeOrder(order.id)
  }
}

// Handle payment completion
const handlePaymentComplete = async (payments) => {
  try {
    const user = authManager.getCurrentUser()

    // Process split payment
    const result = await paymentTransactionManager.processSplitPayment(
      selectedOrder.id,
      user.id,
      payments,
      user.id // recorded_by
    )

    if (result.success) {
      notify.success('Payment collected successfully!')

      // Update order payment_method to 'Split' if multiple methods
      await paymentTransactionManager.updateOrderPaymentMethodToSplit(selectedOrder.id)

      // Complete the order
      await completeOrder(selectedOrder.id)

      // Refresh order data
      fetchOrders()
    }
  } catch (error) {
    notify.error(`Payment failed: ${error.message}`)
  }
}

// In your JSX
<SplitPaymentModal
  isOpen={showPaymentModal}
  onClose={() => setShowPaymentModal(false)}
  totalAmount={selectedOrder?.total_amount || 0}
  amountDue={paymentTransactionManager.calculateAmountDue(selectedOrder)}
  onPaymentComplete={handlePaymentComplete}
  customer={selectedOrder?.customers}
  title="Collect Payment for Order"
/>
```

#### C. Display Payment Status in Order List

```javascript
// In your order card/list item
const paymentBadge = paymentTransactionManager.getPaymentStatusBadge(order)

<div className={`px-2 py-1 rounded-full text-xs font-semibold bg-${paymentBadge.color}-100 text-${paymentBadge.color}-700`}>
  {paymentBadge.text}
</div>

// Show amount due
{order.payment_status !== 'Paid' && (
  <div className="text-sm text-red-600">
    Due: Rs {paymentTransactionManager.calculateAmountDue(order).toFixed(2)}
  </div>
)}
```

#### D. Show Payment History

```javascript
const [paymentHistory, setPaymentHistory] = useState([])

const fetchPaymentHistory = async (orderId) => {
  const summary = await paymentTransactionManager.getPaymentSummary(orderId)
  setPaymentHistory(summary.transactions || [])
}

// Display transactions
{paymentHistory.map(txn => (
  <div key={txn.id} className="flex justify-between">
    <span>{paymentTransactionManager.getPaymentMethodDisplay(txn.payment_method)}</span>
    <span>Rs {txn.amount}</span>
  </div>
))}
```

---

## 🔍 Testing Scenarios

### Scenario 1: Partial Payment at Creation
1. Create order for Rs 1500
2. Select "Unpaid" payment method
3. Order created with `payment_status = 'Pending'`, `amount_paid = 0`
4. From Orders page, click "Collect Payment"
5. Enter Rs 500 Cash
6. Order now has `payment_status = 'Partial'`, `amount_paid = 500`

### Scenario 2: Split Payment
1. Customer wants to pay Rs 1500 total
2. Open split payment modal
3. Add payment 1: Rs 500 Cash
4. Add payment 2: Rs 1000 Account
5. Confirm payment
6. Order `payment_status = 'Paid'`, `payment_method = 'Split'`
7. Customer ledger has debit entry for Rs 1000

### Scenario 3: Full Account Payment
1. Create order for Rs 1500
2. Select "Account" payment method
3. Order created with `payment_status = 'Pending'`
4. On complete, collect payment via Account
5. Rs 1500 added to customer's `account_balance`
6. Ledger entry created

---

## 🛡️ Important Notes

### Backward Compatibility
- **Existing orders are NOT affected**
- Old orders without `order_payment_transactions` entries will continue to work
- `orders.amount_paid` defaults to 0, calculated field `amount_due` handles everything
- The trigger only updates when new transactions are added

### Customer Ledger Integration
- When payment method is 'Account', a **debit entry** is automatically created in `customer_ledger`
- Customer's `account_balance` is automatically updated
- This allows tracking receivables from customers

### Payment Status Logic
- `Pending` = No payment received (`amount_paid = 0`)
- `Partial` = Some payment received (`0 < amount_paid < total_amount`)
- `Paid` = Fully paid (`amount_paid >= total_amount`)

### Split Payment Logic
- When multiple different payment methods are used, `orders.payment_method` is set to `'Split'`
- Individual transactions are stored in `order_payment_transactions`
- This allows reports to show breakdown by method

---

## 📊 Useful Queries

### Get all split payment orders
```sql
SELECT order_number, total_amount, amount_paid, payment_status
FROM orders
WHERE payment_method = 'Split'
ORDER BY created_at DESC;
```

### Get payment breakdown for an order
```sql
SELECT
  payment_method,
  SUM(amount) as total_amount,
  COUNT(*) as transaction_count
FROM order_payment_transactions
WHERE order_id = 'YOUR_ORDER_ID'
GROUP BY payment_method;
```

### Get customer account balance summary
```sql
SELECT
  c.full_name,
  c.phone,
  c.account_balance,
  COUNT(l.id) as ledger_entries
FROM customers c
LEFT JOIN customer_ledger l ON l.customer_id = c.id
WHERE c.account_balance > 0
GROUP BY c.id
ORDER BY c.account_balance DESC;
```

### Get orders with pending payments
```sql
SELECT
  order_number,
  order_type,
  total_amount,
  amount_paid,
  (total_amount - COALESCE(amount_paid, 0)) as amount_due,
  payment_status
FROM orders
WHERE payment_status IN ('Pending', 'Partial')
  AND order_status != 'Cancelled'
ORDER BY created_at DESC;
```

---

## 🐛 Troubleshooting

### Issue: "Payment method 'Account' is not valid"
**Solution:** Run the migration again. The constraint update may have failed.

### Issue: `amount_paid` not updating
**Solution:** Check if trigger exists:
```sql
SELECT trigger_name
FROM information_schema.triggers
WHERE trigger_name = 'trigger_update_order_amount_paid';
```

If missing, re-run migration step 3.

### Issue: Customer ledger not updating for Account payments
**Solution:** Ensure `customer_id` is set on the order. Account payments require a customer.

---

## 📞 Support

For issues or questions:
1. Check the console logs for detailed error messages
2. Verify migration ran successfully
3. Check Supabase logs for database errors
4. Review the transaction records in `order_payment_transactions` table

---

## 🚀 Future Enhancements

Potential additions to consider:
- [ ] Payment refunds/reversals
- [ ] Payment due notifications
- [ ] Automatic payment reminders
- [ ] Payment installment plans
- [ ] Integration with accounting software
- [ ] Payment analytics dashboard

---

**Last Updated:** 2026-01-24
**Version:** 1.0.0
