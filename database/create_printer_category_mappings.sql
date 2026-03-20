-- Printer Category/Deal Routing Mappings
-- Maps product categories and deals to specific printers for kitchen token routing.
-- When an order is placed, items are grouped by their mapped printer and
-- separate kitchen tokens are sent to each printer automatically.

CREATE TABLE IF NOT EXISTS public.printer_category_mappings (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('category', 'deal')),
  entity_id   uuid NOT NULL,   -- category.id or deal.id
  printer_id  uuid NOT NULL,   -- printers.id (Supabase printer record)
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, type, entity_id)
);

-- Index for fast lookup per user
CREATE INDEX IF NOT EXISTS idx_printer_category_mappings_user
  ON public.printer_category_mappings(user_id);

COMMENT ON TABLE public.printer_category_mappings IS
  'Maps product categories and deals to specific printers for automatic kitchen token routing';
