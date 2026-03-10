-- Fix permissions for order_payment_transactions table
-- This allows split payment transactions to be inserted

-- Check if table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_name = 'order_payment_transactions'
);

-- Enable RLS (if not already enabled)
ALTER TABLE order_payment_transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Users can insert their own payment transactions" ON order_payment_transactions;
DROP POLICY IF EXISTS "Users can view their own payment transactions" ON order_payment_transactions;
DROP POLICY IF EXISTS "Users can update their own payment transactions" ON order_payment_transactions;
DROP POLICY IF EXISTS "Users can delete their own payment transactions" ON order_payment_transactions;

-- Create new policies for authenticated users
CREATE POLICY "Enable insert for authenticated users"
  ON order_payment_transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Enable select for authenticated users"
  ON order_payment_transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable update for authenticated users"
  ON order_payment_transactions FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Enable delete for authenticated users"
  ON order_payment_transactions FOR DELETE
  TO authenticated
  USING (true);

-- Verify table structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'order_payment_transactions'
ORDER BY ordinal_position;

-- Check if there's a user_id column (might be needed)
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'order_payment_transactions'
  AND column_name = 'user_id';
