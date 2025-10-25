-- Add frequency and time columns to user_notification_preferences
ALTER TABLE user_notification_preferences
ADD COLUMN IF NOT EXISTS project_summary_frequency TEXT DEFAULT 'monthly',
ADD COLUMN IF NOT EXISTS project_summary_time TIME DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS workorder_summary_frequency TEXT DEFAULT 'monthly',
ADD COLUMN IF NOT EXISTS workorder_summary_time TIME DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS maintenance_reminders_frequency TEXT DEFAULT 'weekly',
ADD COLUMN IF NOT EXISTS maintenance_reminders_time TIME DEFAULT '08:00',
ADD COLUMN IF NOT EXISTS maintenance_history_frequency TEXT DEFAULT 'yearly',
ADD COLUMN IF NOT EXISTS maintenance_history_time TIME DEFAULT '08:00';