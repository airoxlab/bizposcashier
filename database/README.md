# Database Setup

## Expense Tables Migration

To fix the expense categories and expenses feature, you need to create the required database tables.

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** (in the left sidebar)
3. Click **New Query**
4. Copy the entire contents of `create_expense_tables.sql`
5. Paste it into the SQL editor
6. Click **Run** to execute the SQL

### Option 2: Using psql Command Line

```bash
psql -h your-db-host -U your-username -d your-database -f create_expense_tables.sql
```

### Tables Created

This migration creates the following tables:

1. **expense_categories** - Stores expense categories (Rent, Utilities, Salaries, etc.)
2. **expense_subcategories** - Stores subcategories under each category
3. **expenses** - Stores all expense records

### Features Enabled

After running this migration, you'll be able to:

- ✅ Add expense categories and subcategories
- ✅ Record expenses with categories
- ✅ View and filter expenses by category
- ✅ Edit and delete expenses
- ✅ Track expenses by date and payment method

### Row Level Security (RLS)

The migration automatically enables RLS policies to ensure:
- Users can only view/modify their own data
- Data is protected and isolated per user

### Verification

After running the migration, refresh the expenses page and check the browser console for:
```
✅ Found categories: 0
```

This means the tables were created successfully and the app can now access them.
