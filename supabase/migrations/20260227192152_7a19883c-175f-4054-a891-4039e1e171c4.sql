
-- Create rate limiting table
CREATE TABLE public.api_rate_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  window_start timestamp with time zone NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_api_rate_limits_user_endpoint ON public.api_rate_limits (user_id, endpoint, window_start);

-- Auto-cleanup old entries (older than 1 hour)
CREATE INDEX idx_api_rate_limits_cleanup ON public.api_rate_limits (window_start);

-- Enable RLS
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role should access this table (edge functions use service role)
-- No user-facing policies needed
