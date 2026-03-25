-- Add service charge columns to orders table
-- Run this in Supabase SQL Editor

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS service_charge_amount    DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_charge_percentage DECIMAL(5,2)  NOT NULL DEFAULT 0;

-- Comment for documentation
COMMENT ON COLUMN orders.service_charge_amount    IS 'Flat Rs amount of service charge applied at payment';
COMMENT ON COLUMN orders.service_charge_percentage IS 'Service charge percentage applied at payment (0 if fixed amount)';
