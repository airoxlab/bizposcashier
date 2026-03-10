-- Create expense categories table
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT expense_categories_pkey PRIMARY KEY (id),
  CONSTRAINT expense_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Create index on user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_expense_categories_user_id ON public.expense_categories USING btree (user_id) TABLESPACE pg_default;

-- Create expense subcategories table
CREATE TABLE IF NOT EXISTS public.expense_subcategories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category_id uuid NOT NULL,
  name VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT expense_subcategories_pkey PRIMARY KEY (id),
  CONSTRAINT expense_subcategories_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT expense_subcategories_category_id_fkey FOREIGN KEY (category_id) REFERENCES expense_categories (id) ON DELETE CASCADE
) TABLESPACE pg_default;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_expense_subcategories_user_id ON public.expense_subcategories USING btree (user_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_expense_subcategories_category_id ON public.expense_subcategories USING btree (category_id) TABLESPACE pg_default;

-- Create expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT,
  payment_method VARCHAR(100),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expense_time TIME,
  category_id uuid,
  subcategory_id uuid,
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT expenses_pkey PRIMARY KEY (id),
  CONSTRAINT expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT expenses_category_id_fkey FOREIGN KEY (category_id) REFERENCES expense_categories (id) ON DELETE SET NULL,
  CONSTRAINT expenses_subcategory_id_fkey FOREIGN KEY (subcategory_id) REFERENCES expense_subcategories (id) ON DELETE SET NULL
) TABLESPACE pg_default;

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_expenses_user_id ON public.expenses USING btree (user_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON public.expenses USING btree (category_id) TABLESPACE pg_default;
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON public.expenses USING btree (expense_date) TABLESPACE pg_default;

-- Enable Row Level Security
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for expense_categories
CREATE POLICY "Users can view their own expense categories"
  ON public.expense_categories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own expense categories"
  ON public.expense_categories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own expense categories"
  ON public.expense_categories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own expense categories"
  ON public.expense_categories FOR DELETE
  USING (auth.uid() = user_id);

-- Create RLS policies for expense_subcategories
CREATE POLICY "Users can view their own expense subcategories"
  ON public.expense_subcategories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own expense subcategories"
  ON public.expense_subcategories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own expense subcategories"
  ON public.expense_subcategories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own expense subcategories"
  ON public.expense_subcategories FOR DELETE
  USING (auth.uid() = user_id);

-- Create RLS policies for expenses
CREATE POLICY "Users can view their own expenses"
  ON public.expenses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own expenses"
  ON public.expenses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own expenses"
  ON public.expenses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own expenses"
  ON public.expenses FOR DELETE
  USING (auth.uid() = user_id);
