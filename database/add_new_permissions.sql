-- ═══════════════════════════════════════════════════════
-- Add permissions for new pages (WhatsApp & Marketing)
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

-- WhatsApp Settings (separate from general SETTINGS so admin can allow
-- cashiers to manage WA templates without full settings access)
INSERT INTO public.permissions (permission_key, permission_name, description, permission_type)
VALUES ('WHATSAPP_SETTINGS', 'WhatsApp Settings', 'Access WhatsApp settings — templates, auto-send toggles, and campaign config', 'PAGE')
ON CONFLICT (permission_key) DO NOTHING;

-- Marketing sub-page permissions (granular control beyond the existing MARKETING key)
INSERT INTO public.permissions (permission_key, permission_name, description, permission_type)
VALUES ('MARKETING_CAMPAIGN', 'Marketing — Campaigns', 'Create and send bulk WhatsApp campaigns', 'PAGE')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.permissions (permission_key, permission_name, description, permission_type)
VALUES ('MARKETING_CAMPAIGN_LOG', 'Marketing — Campaign Log', 'View campaign send history', 'PAGE')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.permissions (permission_key, permission_name, description, permission_type)
VALUES ('MARKETING_AUTO_SEND_LOG', 'Marketing — Auto-Send Log', 'View auto-send message logs', 'PAGE')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO public.permissions (permission_key, permission_name, description, permission_type)
VALUES ('MARKETING_CONTACTS', 'Marketing — Contacts', 'Manage WhatsApp contacts and block list', 'PAGE')
ON CONFLICT (permission_key) DO NOTHING;
