-- Drop the unique constraint that prevents different users from having the same category name

ALTER TABLE expense_categories
DROP CONSTRAINT IF EXISTS expense_categories_user_id_name_key;

-- Verify the constraint is gone
SELECT
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'expense_categories'::regclass;
