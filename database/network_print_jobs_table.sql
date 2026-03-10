-- Network Print Jobs Table
-- Used for coordinating print jobs across multiple terminals via Supabase realtime

CREATE TABLE IF NOT EXISTS public.network_print_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  print_data jsonb NOT NULL,
  status character varying(20) NOT NULL DEFAULT 'pending',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone NULL,
  error_message text NULL,
  CONSTRAINT network_print_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT network_print_jobs_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT network_print_jobs_status_check CHECK (
    status IN ('pending', 'processing', 'completed', 'failed')
  )
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_network_print_jobs_user_id
  ON public.network_print_jobs USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_network_print_jobs_status
  ON public.network_print_jobs USING btree (status);

CREATE INDEX IF NOT EXISTS idx_network_print_jobs_created_at
  ON public.network_print_jobs USING btree (created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.network_print_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own print jobs
CREATE POLICY "Users can view their own print jobs"
  ON public.network_print_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can insert their own print jobs
CREATE POLICY "Users can insert their own print jobs"
  ON public.network_print_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own print jobs
CREATE POLICY "Users can update their own print jobs"
  ON public.network_print_jobs
  FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policy: Users can delete their own print jobs
CREATE POLICY "Users can delete their own print jobs"
  ON public.network_print_jobs
  FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-delete completed jobs older than 1 hour (optional cleanup)
CREATE OR REPLACE FUNCTION cleanup_old_print_jobs()
RETURNS void AS $$
BEGIN
  DELETE FROM public.network_print_jobs
  WHERE status IN ('completed', 'failed')
    AND created_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;

-- Note: You can set up a cron job or periodic trigger to call cleanup_old_print_jobs()
