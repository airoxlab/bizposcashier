-- Test script to diagnose expense_categories insert issues
-- Run this in your Supabase SQL Editor to check permissions and structure

-- 1. Check if table exists and view structure
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'expense_categories'
ORDER BY ordinal_position;

-- 2. Check current RLS policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'expense_categories';

-- 3. Check if RLS is enabled
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'expense_categories';

-- 4. Try to see current user
SELECT current_user, auth.uid();

-- 5. Check existing categories (if any)
SELECT * FROM expense_categories LIMIT 5;
