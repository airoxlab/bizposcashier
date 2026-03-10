# 🔀 How to Use Split Payment

## Overview

Split Payment allows you to accept **multiple payment methods** for a single order. For example:
- Rs 1000 Cash + Rs 960 EasyPaisa = Rs 1960 Total

---

## 📱 User Flow

### Step 1: Complete Your Order
1. Add items to cart (Chic roll, Kabab roll, etc.)
2. Click "Proceed to Payment"
3. You'll see the payment page with order total

### Step 2: Choose Split Payment
Instead of selecting a single payment method (Cash, EasyPaisa, etc.):

1. **Click the orange "Split Payment (Multiple Methods)" button**
   - Located below all the payment method cards
   - Says: "Pay using multiple payment methods"

### Step 3: Enter Payment Amounts

A modal will open showing all payment methods at once:

You'll see all 5 payment methods displayed at once:
- **Cash**
- **EasyPaisa**
- **JazzCash**
- **Meezan Bank**
- **Customer Account** (only if customer selected)

**Enter amounts directly:**
- Type `1000` in Cash field
- Type `960` in EasyPaisa field
- Leave other fields empty (or enter 0)

### Step 4: Verify Total

The modal shows a **real-time summary**:
```
Order Total:     Rs 1960.00
You Entered:     Rs 1960.00
Remaining:       Rs 0.00 ✅
```

- If remaining is **0**, you can proceed
- If not, adjust amounts
- The system prevents overpayment automatically

### Step 5: Complete Payment

Click **"Complete Payment"** button

The system will:
1. ✅ Create the order with split payment details
2. ✅ Record all payment transactions in database
3. ✅ Set payment status to "Paid"
4. ✅ Mark payment method as "Split"
5. ✅ Show order confirmation with order number

---

## 💡 Features

### All Payment Methods Visible
- See all 5 payment methods at once
- No need to click "Add Payment" buttons
- Just type amounts in the fields you want to use
- Empty fields = Rs 0 (not used)

### Real-time Validation
- ❌ Can't confirm if total doesn't match
- ❌ Shows error if payment method not selected
- ❌ Shows error if amount is 0 or negative
- ✅ Reference number required for EasyPaisa/JazzCash/Bank

### Account Payment Support
- If customer is selected, you can use "Customer Account" as payment method
- Amount will be added to customer's account balance
- Tracked in customer ledger automatically

### Flexible Scenarios

**Scenario 1: Partial Cash + Rest on Account**
```
Total: Rs 2000
Payment 1: Rs 500 Cash
Payment 2: Rs 1500 Account
```

**Scenario 2: Split Between Two Digital Methods**
```
Total: Rs 3000
Payment 1: Rs 1500 EasyPaisa
Payment 2: Rs 1500 JazzCash
```

**Scenario 3: Three-way Split**
```
Total: Rs 5000
Payment 1: Rs 2000 Cash
Payment 2: Rs 2000 Bank
Payment 3: Rs 1000 Account
```

---

## 📊 Tracking Split Payments

### In Orders Page
Orders paid via split payment will show:
- **Payment Method:** "Split"
- **Payment Status:** "Paid"
- View payment breakdown by clicking order details

### Payment History
Each order tracks all individual transactions:
- Date & time of each payment
- Payment method used
- Amount paid
- Reference numbers
- Who recorded the payment

### Customer Account
If "Account" was used:
- Customer balance updated automatically
- Ledger entry created
- Shows in customer statement

---

## ⚠️ Important Notes

### Before Using Split Payment

1. **Run the database migration first!**
   - File: `database/migrations/001_create_order_payment_transactions.sql`
   - This creates the required tables and functions

2. **Customer Required for Account Payment**
   - You can only use "Account" payment if a customer is selected
   - Otherwise, the option will be disabled

3. **Reference Numbers**
   - **Required** for: EasyPaisa, JazzCash, Bank
   - **Not required** for: Cash, Account

### Payment Validation

The system prevents:
- ❌ Overpayment (entering more than total)
- ❌ Underpayment (entering less than total)
- ❌ Missing payment methods
- ❌ Zero or negative amounts

---

## 🎯 Example: Your Current Order

For your order (Total: Rs 1960):

1. Click **"Split Payment"** button
2. First payment:
   - Method: **Cash**
   - Amount: **1000**
3. Click **"+ Add Another Payment Method"**
4. Second payment:
   - Method: **EasyPaisa**
   - Amount: **960**
   - Reference: **EP123456789** (example)
5. Verify total matches (Rs 1960)
6. Click **"Confirm Payment"**
7. Done! ✅

The receipt will show:
```
Order Total: Rs 1960.00
Payment Method: Split
  - Cash: Rs 1000.00
  - EasyPaisa: Rs 960.00
```

---

## 🔍 Finding Split Payment Orders

In the Orders page:
- Look for orders with **Payment Method: "Split"**
- Click order to see payment breakdown
- Each transaction is recorded separately

---

## ❓ FAQ

**Q: Can I use split payment after order is created?**
A: Currently split payment is only during order creation. For collecting payment later, see the "Collect Payment" feature in pending orders.

**Q: What if I make a mistake?**
A: You can edit payment amounts before clicking "Confirm Payment". After confirmation, contact admin to adjust.

**Q: Can I combine cash with account payment?**
A: Yes! That's one of the most common use cases.

**Q: Will old orders be affected?**
A: No! Old orders continue to work normally. Split payment is only for new orders.

---

**Last Updated:** 2026-01-24
