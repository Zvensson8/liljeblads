-- Add category and priority columns for checklist grouping
ALTER TABLE project_checklist_items 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';

-- Add comment for documentation
COMMENT ON COLUMN project_checklist_items.category IS 'planning | execution | closing';
COMMENT ON COLUMN project_checklist_items.priority IS 'high | normal | low';