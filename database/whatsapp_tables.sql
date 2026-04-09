-- ============================================================
-- WhatsApp Feature Tables
-- BizPOS - SaaS Multi-tenant (each table has user_id)
-- ============================================================

-- 1. WhatsApp Settings (one row per user)
CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,

  -- Connection state (managed by app, not persisted long-term)
  is_connected boolean NOT NULL DEFAULT false,
  last_connected_at timestamp with time zone NULL,

  -- Auto-reconnect
  auto_reconnect boolean NOT NULL DEFAULT true,

  -- Auto thank-you send on order complete
  auto_send_on_complete boolean NOT NULL DEFAULT true,

  -- Per order-type toggles
  auto_send_walkin boolean NOT NULL DEFAULT true,
  auto_send_takeaway boolean NOT NULL DEFAULT true,
  auto_send_delivery boolean NOT NULL DEFAULT true,

  -- Review link
  include_review_link boolean NOT NULL DEFAULT true,
  review_base_url text NULL,

  -- Message templates (variables: {customer_name} {order_number} {order_type} {total_amount} {business_name} {review_link})
  walkin_template text NOT NULL DEFAULT 'Thank you {customer_name} for dining with us! 🍽️

Your order #{order_number} of Rs.{total_amount} has been completed.

We hope you enjoyed your meal!
— {business_name}',

  takeaway_template text NOT NULL DEFAULT 'Thank you {customer_name}! 🎉

Your takeaway order #{order_number} of Rs.{total_amount} is ready.

We appreciate your business!
— {business_name}',

  delivery_template text NOT NULL DEFAULT 'Thank you {customer_name}! 🚀

Your delivery order #{order_number} of Rs.{total_amount} has been delivered.

Hope you enjoy your meal!
— {business_name}',

  -- Campaign settings
  campaign_send_delay_min integer NOT NULL DEFAULT 3,
  campaign_send_delay_max integer NOT NULL DEFAULT 8,

  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT whatsapp_settings_pkey PRIMARY KEY (id),
  CONSTRAINT whatsapp_settings_user_id_key UNIQUE (user_id),
  CONSTRAINT whatsapp_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_settings_delay_check CHECK (campaign_send_delay_min >= 1 AND campaign_send_delay_max >= campaign_send_delay_min)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_whatsapp_settings_user_id
  ON public.whatsapp_settings USING btree (user_id) TABLESPACE pg_default;


-- ============================================================
-- 2. WhatsApp Auto-Send Log (one row per order attempt)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_auto_send_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid NOT NULL,
  customer_id uuid NULL,

  phone_sent_to character varying(20) NULL,
  order_type character varying(20) NULL,
  message_sent text NULL,

  status character varying(10) NOT NULL DEFAULT 'pending',
  -- 'sent' | 'failed' | 'skipped'

  skip_reason character varying(50) NULL,
  -- 'no_customer' | 'no_phone' | 'blocked' | 'already_sent' | 'wa_disconnected' | 'order_type_disabled'

  error_message text NULL,
  sent_at timestamp with time zone NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT whatsapp_auto_send_logs_pkey PRIMARY KEY (id),
  CONSTRAINT whatsapp_auto_send_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_auto_send_logs_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_auto_send_logs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT whatsapp_auto_send_logs_status_check CHECK (status IN ('sent', 'failed', 'skipped', 'pending'))
) TABLESPACE pg_default;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_auto_send_unique_order
  ON public.whatsapp_auto_send_logs (user_id, order_id)
  TABLESPACE pg_default;
-- Prevents duplicate sends for the same order

CREATE INDEX IF NOT EXISTS idx_whatsapp_auto_send_user_id
  ON public.whatsapp_auto_send_logs USING btree (user_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_whatsapp_auto_send_order_id
  ON public.whatsapp_auto_send_logs USING btree (order_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_whatsapp_auto_send_status
  ON public.whatsapp_auto_send_logs USING btree (user_id, status) TABLESPACE pg_default;


-- ============================================================
-- 3. WhatsApp Contacts (global block list per user)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL,

  is_blocked boolean NOT NULL DEFAULT false,
  block_reason text NULL,
  blocked_at timestamp with time zone NULL,

  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT whatsapp_contacts_pkey PRIMARY KEY (id),
  CONSTRAINT whatsapp_contacts_unique UNIQUE (user_id, customer_id),
  CONSTRAINT whatsapp_contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_contacts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_user_id
  ON public.whatsapp_contacts USING btree (user_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_blocked
  ON public.whatsapp_contacts USING btree (user_id, is_blocked) TABLESPACE pg_default
  WHERE (is_blocked = true);


-- ============================================================
-- 4. WhatsApp Campaign (marketing campaigns)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,

  name character varying(255) NOT NULL,
  message_template text NOT NULL,

  media_type character varying(10) NULL,
  -- 'image' | 'video' | 'pdf' | null (text only)
  media_path text NULL,
  media_name character varying(255) NULL,

  status character varying(20) NOT NULL DEFAULT 'draft',
  -- 'draft' | 'running' | 'completed' | 'failed' | 'cancelled'

  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,

  scheduled_at timestamp with time zone NULL,
  started_at timestamp with time zone NULL,
  completed_at timestamp with time zone NULL,

  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT whatsapp_campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT whatsapp_campaigns_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_campaigns_status_check CHECK (status IN ('draft', 'running', 'completed', 'failed', 'cancelled')),
  CONSTRAINT whatsapp_campaigns_media_type_check CHECK (media_type IN ('image', 'video', 'pdf') OR media_type IS NULL)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_user_id
  ON public.whatsapp_campaigns USING btree (user_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_status
  ON public.whatsapp_campaigns USING btree (user_id, status) TABLESPACE pg_default;


-- ============================================================
-- 5. WhatsApp Campaign Messages (one row per recipient per campaign)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  customer_id uuid NULL,

  phone character varying(20) NOT NULL,
  customer_name character varying(255) NULL,
  message_sent text NULL,

  status character varying(10) NOT NULL DEFAULT 'pending',
  -- 'pending' | 'sent' | 'failed' | 'skipped'

  skip_reason character varying(50) NULL,
  error_message text NULL,

  sent_at timestamp with time zone NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT whatsapp_campaign_messages_pkey PRIMARY KEY (id),
  CONSTRAINT whatsapp_campaign_messages_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES whatsapp_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_campaign_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_campaign_messages_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT whatsapp_campaign_messages_status_check CHECK (status IN ('pending', 'sent', 'failed', 'skipped'))
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_messages_campaign_id
  ON public.whatsapp_campaign_messages USING btree (campaign_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_messages_user_id
  ON public.whatsapp_campaign_messages USING btree (user_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_whatsapp_campaign_messages_status
  ON public.whatsapp_campaign_messages USING btree (campaign_id, status) TABLESPACE pg_default;


-- ============================================================
-- 6. Order Reviews (for the review link sent via WhatsApp)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.order_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid NOT NULL,
  customer_id uuid NULL,

  review_token uuid NOT NULL DEFAULT gen_random_uuid(),
  -- This token is used in the public URL: /review/{review_token}

  is_reviewed boolean NOT NULL DEFAULT false,
  reviewed_at timestamp with time zone NULL,

  overall_rating integer NULL,
  -- 1 to 5 stars

  comment text NULL,

  created_at timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT order_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT order_reviews_review_token_key UNIQUE (review_token),
  CONSTRAINT order_reviews_user_order_unique UNIQUE (user_id, order_id),
  CONSTRAINT order_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT order_reviews_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT order_reviews_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT order_reviews_rating_check CHECK (overall_rating IS NULL OR (overall_rating >= 1 AND overall_rating <= 5))
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_order_reviews_user_id
  ON public.order_reviews USING btree (user_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_order_reviews_token
  ON public.order_reviews USING btree (review_token) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_order_reviews_order_id
  ON public.order_reviews USING btree (order_id) TABLESPACE pg_default;


-- ============================================================
-- 7. Order Item Reviews (per-product star rating)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.order_item_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL,
  user_id uuid NOT NULL,

  product_id uuid NULL,
  product_name text NOT NULL,
  -- Snapshot of name at time of order

  rating integer NOT NULL,
  -- 1 to 5

  CONSTRAINT order_item_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT order_item_reviews_review_id_fkey FOREIGN KEY (review_id) REFERENCES order_reviews(id) ON DELETE CASCADE,
  CONSTRAINT order_item_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT order_item_reviews_rating_check CHECK (rating >= 1 AND rating <= 5)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_order_item_reviews_review_id
  ON public.order_item_reviews USING btree (review_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_order_item_reviews_product_id
  ON public.order_item_reviews USING btree (product_id) TABLESPACE pg_default;
