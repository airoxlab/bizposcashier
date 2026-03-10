-- Add printer preferences to users table
-- These preferences will persist across sessions and devices

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_print_server boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS share_printer_mode boolean DEFAULT false;

-- Add index for faster queries (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_users_printer_settings
ON public.users(is_print_server, share_printer_mode)
WHERE is_print_server = true OR share_printer_mode = true;

COMMENT ON COLUMN public.users.is_print_server IS 'Whether this user terminal acts as a print server (has physical printer)';
COMMENT ON COLUMN public.users.share_printer_mode IS 'Whether this user terminal sends print jobs to network (no physical printer)';

-- Add printer preferences to cashiers table as well
-- Cashiers can also login and need these settings

ALTER TABLE public.cashiers
ADD COLUMN IF NOT EXISTS is_print_server boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS share_printer_mode boolean DEFAULT false;

-- Add index for cashiers (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_cashiers_printer_settings
ON public.cashiers(is_print_server, share_printer_mode)
WHERE is_print_server = true OR share_printer_mode = true;

COMMENT ON COLUMN public.cashiers.is_print_server IS 'Whether this cashier terminal acts as a print server (has physical printer)';
COMMENT ON COLUMN public.cashiers.share_printer_mode IS 'Whether this cashier terminal sends print jobs to network (no physical printer)';
