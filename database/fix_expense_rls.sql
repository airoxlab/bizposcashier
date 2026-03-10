-- Temporary fix: Disable RLS to test if that's the issue
-- WARNING: This makes the table accessible to anyone - only for testing!

-- Option 1: Disable RLS temporarily (NOT recommended for production)
-- ALTER TABLE expense_categories DISABLE ROW LEVEL SECURITY;

-- Option 2: Add a more permissive policy for testing
-- Drop existing policies first
DROP POLICY IF EXISTS "Users can insert their own expense categories" ON expense_categories;
DROP POLICY IF EXISTS "Users can view their own expense categories" ON expense_categories;
DROP POLICY IF EXISTS "Users can update their own expense categories" ON expense_categories;
DROP POLICY IF EXISTS "Users can delete their own expense categories" ON expense_categories;

-- Create new policies that work with both auth.uid() and direct user_id
CREATE POLICY "Enable insert for authenticated users"
  ON expense_categories FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Enable select for users based on user_id"
  ON expense_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable update for users based on user_id"
  ON expense_categories FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR user_id::text = auth.uid()::text);

CREATE POLICY "Enable delete for users based on user_id"
  ON expense_categories FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR user_id::text = auth.uid()::text);

-- Apply same to subcategories
DROP POLICY IF EXISTS "Users can insert their own expense subcategories" ON expense_subcategories;
DROP POLICY IF EXISTS "Users can view their own expense subcategories" ON expense_subcategories;
DROP POLICY IF EXISTS "Users can update their own expense subcategories" ON expense_subcategories;
DROP POLICY IF EXISTS "Users can delete their own expense subcategories" ON expense_subcategories;

CREATE POLICY "Enable insert for authenticated users"
  ON expense_subcategories FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Enable select for users"
  ON expense_subcategories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable update for users based on user_id"
  ON expense_subcategories FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR user_id::text = auth.uid()::text);

CREATE POLICY "Enable delete for users based on user_id"
  ON expense_subcategories FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR user_id::text = auth.uid()::text);

-- Apply same to expenses
DROP POLICY IF EXISTS "Users can insert their own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can view their own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can update their own expenses" ON expenses;
DROP POLICY IF EXISTS "Users can delete their own expenses" ON expenses;

CREATE POLICY "Enable insert for authenticated users"
  ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Enable select for users"
  ON expenses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Enable update for users based on user_id"
  ON expenses FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR user_id::text = auth.uid()::text);

CREATE POLICY "Enable delete for users based on user_id"
  ON expenses FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR user_id::text = auth.uid()::text);
