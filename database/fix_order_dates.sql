-- Fix order dates to match created_at timestamp (converted to local timezone)
-- This script corrects orders where order_date doesn't match the local date from created_at

-- Step 1: Preview which orders will be updated (optional - check before running)
SELECT
    id,
    order_number,
    order_date AS current_order_date,
    (created_at AT TIME ZONE 'Asia/Karachi')::date AS correct_order_date,
    order_time AS current_order_time,
    TO_CHAR(created_at AT TIME ZONE 'Asia/Karachi', 'HH24:MI:SS') AS correct_order_time,
    created_at
FROM orders
WHERE order_date != (created_at AT TIME ZONE 'Asia/Karachi')::date
ORDER BY created_at DESC;

-- Step 2: Update order_date to match local date from created_at
-- This fixes the timezone issue where UTC date was used instead of local date
UPDATE orders
SET
    order_date = (created_at AT TIME ZONE 'Asia/Karachi')::date,
    updated_at = NOW()
WHERE order_date != (created_at AT TIME ZONE 'Asia/Karachi')::date;

-- Step 3: (Optional) Also update order_time to match local time from created_at
-- Uncomment the following if you also want to fix order_time
/*
UPDATE orders
SET
    order_time = TO_CHAR(created_at AT TIME ZONE 'Asia/Karachi', 'HH24:MI:SS'),
    updated_at = NOW()
WHERE order_time != TO_CHAR(created_at AT TIME ZONE 'Asia/Karachi', 'HH24:MI:SS');
*/

-- Step 4: Verify the fix - show sample of updated orders
SELECT
    id,
    order_number,
    order_date,
    order_time,
    created_at,
    (created_at AT TIME ZONE 'Asia/Karachi')::timestamp AS created_at_local
FROM orders
ORDER BY created_at DESC
LIMIT 20;

-- Summary: Show count of orders by date
SELECT
    order_date,
    COUNT(*) as order_count
FROM orders
GROUP BY order_date
ORDER BY order_date DESC
LIMIT 10;
