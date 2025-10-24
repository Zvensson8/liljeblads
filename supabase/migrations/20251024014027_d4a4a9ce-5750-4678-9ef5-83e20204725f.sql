-- Add notes, reminder fields to property_todos
ALTER TABLE public.property_todos
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS reminder_date DATE,
ADD COLUMN IF NOT EXISTS reminder_email TEXT;