-- KDS amendment tickets (sub-orders) migration
-- When an order the kitchen has ALREADY started (kitchen_status past 'Placed')
-- is edited, we spawn a small "amendment ticket" that carries only the delta
-- (added / removed / qty-changed items). It appears on the KDS as its own card —
-- labelled #<serial> (<letter>) — so the chef can't miss a late change buried
-- inside a card they've already read.
--
-- The order itself stays ONE financial row (no double revenue). This table is a
-- pure kitchen-workflow entity, and it mirrors orders.kitchen_status semantics so
-- the KDS can group it into the same columns:
--   NULL        = Placed  (fresh ticket, kitchen hasn't touched it yet)
--   'Preparing' = Kitchen started this add-on
--   'Ready'     = Add-on done, waiting to go out with the parent
--   'Collected' = Bumped / dismissed — removed from KDS
--
-- kind:
--   'addon'  = items to MAKE   (added items / quantity increases)  → green card
--   'change' = items CHANGED   (removed items / quantity decreases) → red card

CREATE TABLE IF NOT EXISTS public.kds_amendments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id        UUID,                                  -- store scoping, same as orders.user_id
  order_number   TEXT,                                  -- denormalised for standalone display
  letter         TEXT,                                  -- 'A' / 'B' / 'C' — matches getCurrentUpdateVersion()
  kind           TEXT NOT NULL DEFAULT 'addon' CHECK (kind IN ('addon', 'change')),
  items          JSONB NOT NULL DEFAULT '[]'::jsonb,    -- just the delta line items
  kitchen_status TEXT DEFAULT NULL,                     -- null=Placed → Preparing → Ready → Collected
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kds_amendments_user    ON public.kds_amendments (user_id);
CREATE INDEX IF NOT EXISTS idx_kds_amendments_order   ON public.kds_amendments (order_id);
CREATE INDEX IF NOT EXISTS idx_kds_amendments_status  ON public.kds_amendments (kitchen_status);
CREATE INDEX IF NOT EXISTS idx_kds_amendments_created ON public.kds_amendments (created_at);

-- Ensure the KDS realtime subscription receives changes. Defensive: no-op if the
-- table is already a member, or if the publication is defined FOR ALL TABLES.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.kds_amendments;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'kds_amendments realtime publication skipped: %', SQLERRM;
  END;
END $$;
