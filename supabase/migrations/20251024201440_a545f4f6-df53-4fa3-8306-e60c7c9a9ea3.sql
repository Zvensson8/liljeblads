-- Create user_notification_preferences table
CREATE TABLE user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Report types
  monthly_project_summary BOOLEAN DEFAULT false,
  monthly_workorder_summary BOOLEAN DEFAULT false,
  maintenance_reminders BOOLEAN DEFAULT false,
  maintenance_history_annual BOOLEAN DEFAULT false,
  
  -- Settings
  preferred_day TEXT DEFAULT 'monday',
  notification_email TEXT,
  
  -- Preview tracking
  project_summary_previewed BOOLEAN DEFAULT false,
  workorder_summary_previewed BOOLEAN DEFAULT false,
  maintenance_reminders_previewed BOOLEAN DEFAULT false,
  maintenance_history_previewed BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id, organization_id)
);

-- Indexes for performance
CREATE INDEX idx_notification_prefs_user ON user_notification_preferences(user_id);
CREATE INDEX idx_notification_prefs_org ON user_notification_preferences(organization_id);

-- Enable RLS
ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own preferences"
  ON user_notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences"
  ON user_notification_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences"
  ON user_notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own preferences"
  ON user_notification_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER set_timestamp_notification_preferences
  BEFORE UPDATE ON user_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- Setup pg_cron for automated reminders (runs daily at 06:00)
SELECT cron.schedule(
  'check-daily-reminders',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url:='https://vfwxpbffadedpvhdxntm.supabase.co/functions/v1/check-and-send-reminders',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmd3hwYmZmYWRlZHB2aGR4bnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzMTY1NjksImV4cCI6MjA3NDg5MjU2OX0.89sAo0ToDwReDLhqAwSt3d7FHocz_-mei_VCu6wRNHY"}'::jsonb,
    body:='{"source": "cron"}'::jsonb
  ) as request_id;
  $$
);