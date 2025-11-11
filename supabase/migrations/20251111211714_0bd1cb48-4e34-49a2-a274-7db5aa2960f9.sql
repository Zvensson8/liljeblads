-- Allow organization_id to be nullable in user_notification_preferences
ALTER TABLE user_notification_preferences 
ALTER COLUMN organization_id DROP NOT NULL;