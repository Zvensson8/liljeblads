-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule the check-and-send-reminders function to run every minute
SELECT cron.schedule(
  'check-send-reminders-every-minute',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
        url:='https://vfwxpbffadedpvhdxntm.supabase.co/functions/v1/check-and-send-reminders',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmd3hwYmZmYWRlZHB2aGR4bnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzMTY1NjksImV4cCI6MjA3NDg5MjU2OX0.89sAo0ToDwReDLhqAwSt3d7FHocz_-mei_VCu6wRNHY"}'::jsonb,
        body:=concat('{"time": "', now(), '"}')::jsonb
    ) as request_id;
  $$
);
