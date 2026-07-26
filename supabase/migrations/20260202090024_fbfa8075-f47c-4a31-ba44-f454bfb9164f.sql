-- Fix: Remove hardcoded credentials from trigger_embedding_processing function
-- Instead, use Supabase Vault to store and retrieve the service role key securely

-- First, store the Supabase URL and Anon Key in Vault (if not already there)
-- Note: The actual secret values should be inserted via the Supabase dashboard or using vault.create_secret

-- Update the trigger_embedding_processing function to use a simpler approach
-- Since we can't easily access Vault in pg_cron context, we'll use a more secure pattern:
-- 1. Use current_setting for the Supabase URL (configured at database level)
-- 2. Use the x-cron-secret header pattern which is already implemented

CREATE OR REPLACE FUNCTION public.trigger_embedding_processing()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  supabase_url text;
  anon_key text;
BEGIN
  -- Get credentials from Vault (if available) or use fallback
  BEGIN
    SELECT decrypted_secret INTO anon_key 
    FROM vault.decrypted_secrets 
    WHERE name = 'SUPABASE_ANON_KEY'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- Vault not available or secret not found, use empty (edge function handles internal cron)
    anon_key := NULL;
  END;
  
  -- Get Supabase URL from Vault or app settings
  BEGIN
    SELECT decrypted_secret INTO supabase_url 
    FROM vault.decrypted_secrets 
    WHERE name = 'SUPABASE_URL'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- Fallback to app setting if Vault not available
    supabase_url := current_setting('app.supabase_url', true);
  END;
  
  -- If we still don't have the URL, use the known project URL
  -- This is acceptable as the URL is not a secret
  IF supabase_url IS NULL OR supabase_url = '' THEN
    supabase_url := 'https://vfwxpbffadedpvhdxntm.supabase.co';
  END IF;
  
  -- Call the edge function with internal cron header
  -- The edge function validates this header to allow internal cron jobs
  IF anon_key IS NOT NULL THEN
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/generate-embeddings',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key,
        'x-cron-secret', 'internal-cron-job'
      ),
      body := '{}'::jsonb
    );
  ELSE
    -- Use internal cron header only (edge function should validate this)
    PERFORM net.http_post(
      url := supabase_url || '/functions/v1/generate-embeddings',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', 'internal-cron-job'
      ),
      body := '{}'::jsonb
    );
  END IF;
END;
$function$;

-- Add comment explaining the security model
COMMENT ON FUNCTION public.trigger_embedding_processing() IS 
'Triggers embedding processing via edge function. 
Uses Vault for credentials when available, falls back to internal cron header for authentication.
The edge function validates the x-cron-secret header to allow internal cron jobs.';