-- Fix: disable RLS on printer_category_mappings (BizPOS uses custom auth)
DROP POLICY IF EXISTS "Users manage own printer mappings" ON public.printer_category_mappings;
DROP POLICY IF EXISTS "Allow all on printer_category_mappings" ON public.printer_category_mappings;
ALTER TABLE public.printer_category_mappings DISABLE ROW LEVEL SECURITY;
