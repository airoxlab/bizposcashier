-- ============================================================
-- Show Dispatch Button Toggle Migration
-- Run this in Supabase SQL Editor
-- Adds show_dispatch_button column to users table (default true)
-- Controls visibility of dispatch button on orders page
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS show_dispatch_button boolean NOT NULL DEFAULT true;
