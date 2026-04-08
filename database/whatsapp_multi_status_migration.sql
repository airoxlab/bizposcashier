-- ============================================================
-- WhatsApp Multi-Status Trigger Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add ready-message toggles to whatsapp_settings
ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS auto_send_on_ready        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_send_walkin_ready    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_send_takeaway_ready  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_send_delivery_ready  boolean NOT NULL DEFAULT true;

-- 2. Add ready-message templates to whatsapp_settings
ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS walkin_ready_template text NOT NULL DEFAULT 'Your order is ready to be served, {customer_name}! 🍽️

Order #{order_number}
— {business_name}',

  ADD COLUMN IF NOT EXISTS takeaway_ready_template text NOT NULL DEFAULT 'Great news, {customer_name}! 🎉

Your takeaway order #{order_number} is ready for pickup!

Please come collect your order at your earliest convenience.
— {business_name}',

  ADD COLUMN IF NOT EXISTS delivery_ready_template text NOT NULL DEFAULT 'Hi {customer_name}! 🚀

Your delivery order #{order_number} is on the way!

Our rider is heading to your location. Please be available to receive it.
— {business_name}';

-- 3. Add trigger_status column to whatsapp_auto_send_logs
ALTER TABLE public.whatsapp_auto_send_logs
  ADD COLUMN IF NOT EXISTS trigger_status character varying(20) NOT NULL DEFAULT 'Completed';

-- 4. Drop old unique index (only allowed one log per order)
DROP INDEX IF EXISTS idx_whatsapp_auto_send_unique_order;

-- 5. Create new unique index (one log per order per trigger status)
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_auto_send_unique_order_status
  ON public.whatsapp_auto_send_logs (user_id, order_id, trigger_status);
