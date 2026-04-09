-- ============================================================
-- WhatsApp Ready Status Toggle Migration
-- Run this in Supabase SQL Editor
-- Adds auto_send_on_ready_status column (default false)
-- Mutually exclusive with auto_send_on_ready (dispatch)
-- ============================================================

ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS auto_send_on_ready_status boolean NOT NULL DEFAULT false;
