-- Migration: Create order_payment_transactions table for multi-payment support
-- Description: Allows multiple payment methods per order (split payments, partial payments)
-- Date: 2026-01-24

-- =====================================================
-- 1. Create order_payment_transactions table
-- =====================================================

CREATE TABLE IF NOT EXISTS public.order_payment_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  user_id UUID NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  transaction_time TIME WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIME,
  reference_number VARCHAR(100) NULL,
  notes TEXT NULL,
  recorded_by UUID NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT order_payment_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT order_payment_transactions_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT order_payment_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT order_payment_transactions_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT order_payment_transactions_amount_check CHECK (amount > 0),
  CONSTRAINT order_payment_transactions_payment_method_check CHECK (
    payment_method IN ('Cash', 'EasyPaisa', 'JazzCash', 'Bank', 'Account')
  )
) TABLESPACE pg_default;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id
  ON public.order_payment_transactions USING btree (order_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id
  ON public.order_payment_transactions USING btree (user_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_date
  ON public.order_payment_transactions USING btree (transaction_date DESC) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_payment_transactions_method
  ON public.order_payment_transactions USING btree (payment_method) TABLESPACE pg_default;


-- =====================================================
-- 2. Add 'Account' to existing payment_method constraints
-- =====================================================

-- Update orders table payment_method constraint
DO $$
BEGIN
  -- Drop existing constraint
  ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;

  -- Add new constraint with 'Account' option
  ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check CHECK (
    payment_method IN ('Cash', 'EasyPaisa', 'JazzCash', 'Bank', 'Unpaid', 'Account', 'Split')
  );
END $$;

-- Update customer_payments table payment_method constraint
DO $$
BEGIN
  -- Drop existing constraint
  ALTER TABLE public.customer_payments DROP CONSTRAINT IF EXISTS customer_payments_payment_method_check;

  -- Add new constraint with 'Account' option
  ALTER TABLE public.customer_payments ADD CONSTRAINT customer_payments_payment_method_check CHECK (
    payment_method IN ('Cash', 'EasyPaisa', 'JazzCash', 'Bank', 'Card', 'Account')
  );
END $$;


-- =====================================================
-- 3. Create trigger to update orders.amount_paid
-- =====================================================

CREATE OR REPLACE FUNCTION update_order_amount_paid()
RETURNS TRIGGER AS $$
BEGIN
  -- Recalculate amount_paid for the order
  UPDATE orders
  SET amount_paid = COALESCE((
    SELECT SUM(amount)
    FROM order_payment_transactions
    WHERE order_id = NEW.order_id
  ), 0),
  updated_at = NOW()
  WHERE id = NEW.order_id;

  -- Update payment_status based on amount_paid vs total_amount
  UPDATE orders
  SET payment_status = CASE
    WHEN amount_paid = 0 THEN 'Pending'
    WHEN amount_paid >= total_amount THEN 'Paid'
    WHEN amount_paid < total_amount THEN 'Partial'
    ELSE payment_status
  END
  WHERE id = NEW.order_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_order_amount_paid
AFTER INSERT OR UPDATE OR DELETE ON order_payment_transactions
FOR EACH ROW
EXECUTE FUNCTION update_order_amount_paid();


-- =====================================================
-- 4. Create function to process order payment
-- =====================================================

CREATE OR REPLACE FUNCTION process_order_payment(
  p_order_id UUID,
  p_user_id UUID,
  p_payment_method VARCHAR(50),
  p_amount NUMERIC(10, 2),
  p_reference_number VARCHAR(100) DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_recorded_by UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_order RECORD;
  v_customer_id UUID;
  v_transaction_id UUID;
  v_new_balance NUMERIC(10, 2);
  v_result JSON;
BEGIN
  -- Get order details
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id AND user_id = p_user_id;

  IF v_order IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Order not found'
    );
  END IF;

  -- Validate amount
  IF p_amount <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Payment amount must be greater than 0'
    );
  END IF;

  -- Check if payment exceeds remaining due
  IF (v_order.amount_paid + p_amount) > v_order.total_amount THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Payment amount exceeds order total'
    );
  END IF;

  -- Insert payment transaction
  INSERT INTO order_payment_transactions (
    order_id,
    user_id,
    payment_method,
    amount,
    reference_number,
    notes,
    recorded_by
  ) VALUES (
    p_order_id,
    p_user_id,
    p_payment_method,
    p_amount,
    p_reference_number,
    p_notes,
    p_recorded_by
  )
  RETURNING id INTO v_transaction_id;

  -- If payment method is 'Account', create customer ledger entry
  IF p_payment_method = 'Account' AND v_order.customer_id IS NOT NULL THEN
    -- Get customer's current balance
    SELECT account_balance INTO v_new_balance
    FROM customers
    WHERE id = v_order.customer_id;

    -- Create ledger entry (debit - customer owes money)
    INSERT INTO customer_ledger (
      user_id,
      customer_id,
      transaction_type,
      amount,
      balance_before,
      balance_after,
      order_id,
      description,
      notes,
      created_by
    ) VALUES (
      p_user_id,
      v_order.customer_id,
      'debit',
      p_amount,
      v_new_balance,
      v_new_balance + p_amount,
      p_order_id,
      'Order payment via account - ' || v_order.order_number,
      p_notes,
      p_recorded_by
    );

    -- Update customer balance
    UPDATE customers
    SET account_balance = account_balance + p_amount
    WHERE id = v_order.customer_id;
  END IF;

  -- Get updated order
  SELECT * INTO v_order
  FROM orders
  WHERE id = p_order_id;

  -- Return result
  RETURN json_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'amount_paid', v_order.amount_paid,
    'amount_due', v_order.total_amount - v_order.amount_paid,
    'payment_status', v_order.payment_status
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- 5. Create function to get order payment summary
-- =====================================================

CREATE OR REPLACE FUNCTION get_order_payment_summary(p_order_id UUID)
RETURNS JSON AS $$
DECLARE
  v_order RECORD;
  v_payments JSON;
  v_result JSON;
BEGIN
  -- Get order details
  SELECT
    id,
    order_number,
    total_amount,
    amount_paid,
    (total_amount - COALESCE(amount_paid, 0)) AS amount_due,
    payment_status,
    payment_method
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Order not found'
    );
  END IF;

  -- Get payment transactions
  SELECT json_agg(
    json_build_object(
      'id', id,
      'payment_method', payment_method,
      'amount', amount,
      'transaction_date', transaction_date,
      'transaction_time', transaction_time,
      'reference_number', reference_number,
      'notes', notes,
      'created_at', created_at
    ) ORDER BY created_at DESC
  ) INTO v_payments
  FROM order_payment_transactions
  WHERE order_id = p_order_id;

  -- Build result
  RETURN json_build_object(
    'success', true,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'total_amount', v_order.total_amount,
    'amount_paid', v_order.amount_paid,
    'amount_due', v_order.amount_due,
    'payment_status', v_order.payment_status,
    'payment_method', v_order.payment_method,
    'transactions', COALESCE(v_payments, '[]'::json)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- 6. Migration complete message
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 001_create_order_payment_transactions completed successfully';
  RAISE NOTICE '   - Created order_payment_transactions table';
  RAISE NOTICE '   - Added Account payment method to constraints';
  RAISE NOTICE '   - Created trigger to update amount_paid';
  RAISE NOTICE '   - Created process_order_payment() function';
  RAISE NOTICE '   - Created get_order_payment_summary() function';
END $$;
