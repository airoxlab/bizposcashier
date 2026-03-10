# Add 'Dispatched' Status to Order Flow

## Overview
This migration adds a new "Dispatched" status to the order workflow, creating a better separation between when food leaves the kitchen vs. when the order is completed.

**Changes:**
- ✅ Adds `Dispatched` status to allowed order statuses
- ✅ Updates database check constraint
- ✅ KDS marks orders as "Dispatched" when they leave the kitchen
- ✅ Orders page marks orders as "Completed" when fully delivered/finished
- ✅ Inventory deduction remains on "Completed" status

---

## 🚀 Quick Apply

### Option 1: Supabase Dashboard (Recommended)
1. Go to **SQL Editor** in your Supabase Dashboard
2. Open `database/migrations/002_update_order_status_to_dispatched.sql`
3. Copy the entire contents
4. Paste into SQL Editor
5. Click **"Run"**

### Option 2: Command Line
```bash
psql -U your_username -d your_database -f database/migrations/002_update_order_status_to_dispatched.sql
```

---

## ✅ Verify Migration Success

Run this query to verify:

```sql
-- Check the constraint allows 'Dispatched'
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'orders_order_status_check';
```

**Expected result:** Should include both `'Dispatched'` AND `'Completed'` in the array

```sql
-- Test creating a dispatched order
UPDATE orders
SET order_status = 'Dispatched'
WHERE id = (SELECT id FROM orders LIMIT 1)
RETURNING order_number, order_status;
```

**Expected result:** Update should succeed without errors

---

## 📊 What Changed

### Database Changes
| Before | After |
|--------|-------|
| 5 allowed statuses | 6 allowed statuses (added 'Dispatched') |
| `Pending, Preparing, Ready, Completed, Cancelled` | `Pending, Preparing, Ready, Dispatched, Completed, Cancelled` |

### Order Status Flow
```
Before: Pending → Preparing → Ready → Completed
After:  Pending → Preparing → Ready → Dispatched → Completed
```

**Where status changes happen:**
- `Ready → Dispatched`: Marked from **KDS page** when food leaves kitchen
- `Dispatched → Completed`: Marked from **Orders/walkin/takeaway/delivery pages** when order is fully completed

### Application Changes
- KDS page now shows "Mark as Dispatch" button in Ready section
- "Completed" section renamed to "Dispatched"
- All order workflows updated

---

## ⚠️ Important Notes

1. **Existing Data:** All existing orders remain unchanged - no data migration needed
2. **New Status:** `Dispatched` is a new intermediate status between `Ready` and `Completed`
3. **Inventory Deduction:** Still triggers when order moves to `Completed` status (not on `Dispatched`)
4. **Backward Compatibility:** Old orders can go directly from `Ready` to `Completed` if needed

---

## 🔄 Rollback (If Needed)

If you need to rollback this change:

```sql
-- Remove 'Dispatched' from allowed statuses
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_status_check;

-- Move any dispatched orders back to Ready or Completed
UPDATE public.orders SET order_status = 'Completed' WHERE order_status = 'Dispatched';

-- Restore original constraint without 'Dispatched'
ALTER TABLE public.orders
ADD CONSTRAINT orders_order_status_check
CHECK (
  (order_status)::text = ANY (
    ARRAY['Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled']::text[]
  )
);
```

---

## 📞 Support

After applying migration:
- Test creating and dispatching orders in KDS
- Verify inventory deduction still works
- Check that reports/analytics reflect the new status

---

**Migration File:** `002_update_order_status_to_dispatched.sql`
**Date Created:** 2026-02-04
**Version:** 1.0.0
