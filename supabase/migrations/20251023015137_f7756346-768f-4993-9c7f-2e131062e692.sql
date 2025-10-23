-- Enable pg_cron extension for scheduling tasks
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net extension for making HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Create cron job to check for work order reminders daily at 9 AM
SELECT cron.schedule(
  'send-work-order-reminders-daily',
  '0 9 * * *', -- Every day at 9:00 AM
  $$
  SELECT
    net.http_post(
      url:='https://vfwxpbffadedpvhdxntm.supabase.co/functions/v1/send-work-order-reminders',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmd3hwYmZmYWRlZHB2aGR4bnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzMTY1NjksImV4cCI6MjA3NDg5MjU2OX0.89sAo0ToDwReDLhqAwSt3d7FHocz_-mei_VCu6wRNHY"}'::jsonb,
      body:='{}'::jsonb
    ) as request_id;
  $$
);