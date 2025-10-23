-- Add reminder columns to work_orders table
ALTER TABLE work_orders
ADD COLUMN IF NOT EXISTS reminder_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS reminder_frequency text DEFAULT 'weekly',
ADD COLUMN IF NOT EXISTS last_reminder_sent timestamp with time zone,
ADD COLUMN IF NOT EXISTS reminder_recipient_email text;

-- Add check constraint for reminder frequency
ALTER TABLE work_orders
ADD CONSTRAINT work_orders_reminder_frequency_check 
CHECK (reminder_frequency IN ('weekly', 'biweekly', 'triweekly', 'monthly', 'none'));

-- Create index for efficient querying of reminders
CREATE INDEX IF NOT EXISTS idx_work_orders_reminders 
ON work_orders(status, reminder_enabled, last_reminder_sent) 
WHERE reminder_enabled = true;