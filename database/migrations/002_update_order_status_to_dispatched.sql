-- Migration: Add 'Dispatched' status to order flow
-- Purpose: Add 'Dispatched' status between 'Ready' and 'Completed' for better order tracking
-- Flow: Pending → Preparing → Ready → Dispatched → Completed
-- Date: 2026-02-04

-- Step 1: Drop the old check constraint
ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_order_status_check;

-- Step 2: Add the new check constraint with 'Dispatched' added (keeping 'Completed')
ALTER TABLE public.orders
ADD CONSTRAINT orders_order_status_check
CHECK (
  (order_status)::text = ANY (
    ARRAY[
      'Pending'::character varying,
      'Preparing'::character varying,
      'Ready'::character varying,
      'Dispatched'::character varying,
      'Completed'::character varying,
      'Cancelled'::character varying
    ]::text[]
  )
);

-- Note: The inventory deduction trigger remains on 'Completed' status
-- This ensures inventory is only deducted when the order is fully completed, not just dispatched
