-- KDS kitchen_status decoupling migration
-- Adds a kitchen_status column owned exclusively by the KDS.
-- Payment completion (order_status = 'Completed') no longer affects KDS visibility.
--
-- kitchen_status values:
--   NULL        = Placed (new order, kitchen hasn't touched it yet)
--   'Preparing' = Kitchen started working on it
--   'Ready'     = Kitchen done, waiting for pickup/dispatch
--   'Collected' = Kitchen dismissed it — removed from KDS

ALTER TABLE orders ADD COLUMN IF NOT EXISTS kitchen_status TEXT DEFAULT NULL;

-- Backfill: existing completed and dispatched orders are already done from kitchen's perspective
UPDATE orders
SET kitchen_status = 'Collected'
WHERE order_status IN ('Completed', 'Dispatched')
  AND kitchen_status IS NULL;

-- Optional index for fast KDS queries filtering by kitchen_status
CREATE INDEX IF NOT EXISTS idx_orders_kitchen_status ON orders (kitchen_status);
