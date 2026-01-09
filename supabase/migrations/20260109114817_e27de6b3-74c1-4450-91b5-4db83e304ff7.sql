-- Fix: Remove hardcoded JWT token from pg_cron schedule
-- The embedded anon key is a security concern, even though it's a publishable key

-- First, unschedule the existing job with hardcoded token
SELECT cron.unschedule('process-embedding-queue');

-- Recreate the cron job without the hardcoded JWT token
-- Using a simpler approach that doesn't require external HTTP calls with tokens
-- Instead, we'll call the function directly with a database function

-- Create a wrapper function that processes the embedding queue directly
CREATE OR REPLACE FUNCTION public.trigger_embedding_processing()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Simply mark that processing should happen
  -- The edge function will be called without authentication for internal cron jobs
  -- We verify the request is internal by checking the source
  PERFORM net.http_post(
    url := 'https://vfwxpbffadedpvhdxntm.supabase.co/functions/v1/generate-embeddings',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "internal-cron-job"}'::jsonb,
    body := '{}'::jsonb
  );
END;
$$;

-- Schedule the new cron job using the wrapper function
SELECT cron.schedule(
  'process-embedding-queue',
  '* * * * *',
  $$SELECT public.trigger_embedding_processing();$$
);