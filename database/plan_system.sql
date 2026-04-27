-- =============================================================================
-- BIZPOS PLAN SYSTEM
-- Tables: plans, plan_features, user_subscriptions, user_feature_overrides
-- Safe to run multiple times (IF NOT EXISTS + ON CONFLICT DO UPDATE)
-- =============================================================================

-- 1. Plans — master list of available subscription plans
CREATE TABLE IF NOT EXISTS public.plans (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  slug         TEXT        UNIQUE NOT NULL,          -- 'starter' | 'growth' | 'business'
  name         TEXT        NOT NULL,
  description  TEXT,
  price_monthly NUMERIC(10,2) DEFAULT 0,
  is_active    BOOLEAN     DEFAULT true,
  sort_order   INTEGER     DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Plan features — feature key/value per plan
--    value is always a string:
--      toggles  → 'true' | 'false'
--      quotas   → '1' | '10' | 'unlimited'
CREATE TABLE IF NOT EXISTS public.plan_features (
  id          UUID   DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id     UUID   NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  feature_key TEXT   NOT NULL,
  value       TEXT   NOT NULL DEFAULT 'false',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(plan_id, feature_key)
);

-- 3. User subscriptions — one row per business owner (user)
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id          UUID   DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID   NOT NULL UNIQUE,               -- references users(id)
  plan_id     UUID   NOT NULL REFERENCES public.plans(id),
  status      TEXT   NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','expired','trial','suspended')),
  started_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,                          -- NULL = no expiry
  notes       TEXT,                                 -- super-admin notes
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 4. User feature overrides — per-user exceptions granted by super admin
--    override_mode:
--      'replace' → use this value instead of plan default
--      'add'     → add this number on top of plan quota (for max_cashiers etc.)
CREATE TABLE IF NOT EXISTS public.user_feature_overrides (
  id            UUID   DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID   NOT NULL,                    -- references users(id)
  feature_key   TEXT   NOT NULL,
  value         TEXT   NOT NULL,
  override_mode TEXT   NOT NULL DEFAULT 'replace'
                  CHECK (override_mode IN ('replace','add')),
  reason        TEXT,                               -- why it was granted
  expires_at    TIMESTAMPTZ,                        -- NULL = permanent
  granted_by    UUID,                               -- super admin user id
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, feature_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_plan_features_plan_id
  ON public.plan_features(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_features_key
  ON public.plan_features(feature_key);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id
  ON public.user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feature_overrides_user_id
  ON public.user_feature_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feature_overrides_expires
  ON public.user_feature_overrides(expires_at)
  WHERE expires_at IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_plans_updated_at'
  ) THEN
    CREATE TRIGGER trg_plans_updated_at
      BEFORE UPDATE ON public.plans
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_subscriptions_updated_at'
  ) THEN
    CREATE TRIGGER trg_user_subscriptions_updated_at
      BEFORE UPDATE ON public.user_subscriptions
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_feature_overrides_updated_at'
  ) THEN
    CREATE TRIGGER trg_user_feature_overrides_updated_at
      BEFORE UPDATE ON public.user_feature_overrides
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- =============================================================================
-- SEED DATA
-- =============================================================================

INSERT INTO public.plans (slug, name, description, price_monthly, sort_order)
VALUES
  ('starter',  'Starter',  'For small shops & single counter businesses', 4999,  1),
  ('growth',   'Growth',   'For cafes, restaurants & growing businesses',  9999,  2),
  ('business', 'Business', 'For multi-branch & serious businesses',         14999, 3)
ON CONFLICT (slug) DO UPDATE SET
  name          = EXCLUDED.name,
  description   = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  sort_order    = EXCLUDED.sort_order,
  updated_at    = NOW();

DO $$
DECLARE
  v_starter  UUID;
  v_growth   UUID;
  v_business UUID;
BEGIN
  SELECT id INTO v_starter  FROM public.plans WHERE slug = 'starter';
  SELECT id INTO v_growth   FROM public.plans WHERE slug = 'growth';
  SELECT id INTO v_business FROM public.plans WHERE slug = 'business';

  -- ── STARTER ──────────────────────────────────────────────────────────────
  INSERT INTO public.plan_features (plan_id, feature_key, value) VALUES
    -- Core toggles: OFF
    (v_starter, 'loyalty_system',     'false'),
    (v_starter, 'kds',                'false'),
    (v_starter, 'inventory_tracking', 'false'),
    (v_starter, 'whatsapp_receipts',  'false'),
    (v_starter, 'staff_permissions',  'false'),
    (v_starter, 'customer_ledger',    'false'),
    (v_starter, 'rider_management',   'false'),
    (v_starter, 'purchase_orders',    'false'),
    (v_starter, 'audit_logs',         'false'),
    (v_starter, 'multi_branch',       'false'),
    (v_starter, 'payroll',            'false'),
    (v_starter, 'petty_cash',         'false'),
    (v_starter, 'advanced_analytics', 'false'),
    (v_starter, 'tablet_ordering',    'false'),
    (v_starter, 'customer_website',   'false'),
    (v_starter, 'marketing_module',   'false'),
    -- Add-ons: OFF (purchasable separately)
    (v_starter, 'addon_whatsapp_bot',     'false'),
    (v_starter, 'addon_whatsapp_reports', 'false'),
    (v_starter, 'addon_priority_support', 'false'),
    (v_starter, 'addon_fbr_epos',         'false'),
    (v_starter, 'addon_owner_mobile_app', 'false'),
    -- Quotas
    (v_starter, 'max_cashiers', '1'),
    (v_starter, 'max_branches', '1')
  ON CONFLICT (plan_id, feature_key) DO UPDATE SET value = EXCLUDED.value;

  -- ── GROWTH ───────────────────────────────────────────────────────────────
  INSERT INTO public.plan_features (plan_id, feature_key, value) VALUES
    (v_growth, 'loyalty_system',     'true'),
    (v_growth, 'kds',                'true'),
    (v_growth, 'inventory_tracking', 'true'),
    (v_growth, 'whatsapp_receipts',  'true'),
    (v_growth, 'staff_permissions',  'true'),
    (v_growth, 'customer_ledger',    'true'),
    (v_growth, 'rider_management',   'true'),
    (v_growth, 'purchase_orders',    'true'),
    (v_growth, 'audit_logs',         'true'),
    -- Business-only: still OFF
    (v_growth, 'multi_branch',       'false'),
    (v_growth, 'payroll',            'false'),
    (v_growth, 'petty_cash',         'false'),
    (v_growth, 'advanced_analytics', 'false'),
    (v_growth, 'tablet_ordering',    'false'),
    (v_growth, 'customer_website',   'false'),
    (v_growth, 'marketing_module',   'false'),
    -- Add-ons: purchasable
    (v_growth, 'addon_whatsapp_bot',     'false'),
    (v_growth, 'addon_whatsapp_reports', 'false'),
    (v_growth, 'addon_priority_support', 'false'),
    (v_growth, 'addon_fbr_epos',         'false'),
    (v_growth, 'addon_owner_mobile_app', 'false'),
    -- Quotas
    (v_growth, 'max_cashiers', '10'),
    (v_growth, 'max_branches', '1')
  ON CONFLICT (plan_id, feature_key) DO UPDATE SET value = EXCLUDED.value;

  -- ── BUSINESS ─────────────────────────────────────────────────────────────
  INSERT INTO public.plan_features (plan_id, feature_key, value) VALUES
    (v_business, 'loyalty_system',     'true'),
    (v_business, 'kds',                'true'),
    (v_business, 'inventory_tracking', 'true'),
    (v_business, 'whatsapp_receipts',  'true'),
    (v_business, 'staff_permissions',  'true'),
    (v_business, 'customer_ledger',    'true'),
    (v_business, 'rider_management',   'true'),
    (v_business, 'purchase_orders',    'true'),
    (v_business, 'audit_logs',         'true'),
    (v_business, 'multi_branch',       'true'),
    (v_business, 'payroll',            'true'),
    (v_business, 'petty_cash',         'true'),
    (v_business, 'advanced_analytics', 'true'),
    (v_business, 'tablet_ordering',    'true'),
    (v_business, 'customer_website',   'true'),
    (v_business, 'marketing_module',   'true'),
    -- All add-ons: included free
    (v_business, 'addon_whatsapp_bot',     'true'),
    (v_business, 'addon_whatsapp_reports', 'true'),
    (v_business, 'addon_priority_support', 'true'),
    (v_business, 'addon_fbr_epos',         'true'),
    (v_business, 'addon_owner_mobile_app', 'true'),
    -- Unlimited quotas
    (v_business, 'max_cashiers', 'unlimited'),
    (v_business, 'max_branches', 'unlimited')
  ON CONFLICT (plan_id, feature_key) DO UPDATE SET value = EXCLUDED.value;

END $$;