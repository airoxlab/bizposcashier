-- Allow 'broadcast' type in printer_category_mappings
-- Run this in your Supabase SQL Editor

ALTER TABLE public.printer_category_mappings
  DROP CONSTRAINT IF EXISTS printer_category_mappings_type_check;

ALTER TABLE public.printer_category_mappings
  ADD CONSTRAINT printer_category_mappings_type_check
  CHECK (type IN ('category', 'deal', 'broadcast'));
