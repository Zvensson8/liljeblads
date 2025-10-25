-- Add foreign key constraint from user_notification_preferences to profiles
ALTER TABLE user_notification_preferences
ADD CONSTRAINT user_notification_preferences_user_id_fkey
FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;