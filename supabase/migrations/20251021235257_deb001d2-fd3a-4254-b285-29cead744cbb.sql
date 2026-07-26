-- Create task templates table for user-specific templates
CREATE TABLE IF NOT EXISTS drift_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES drift_categories(id) ON DELETE SET NULL,
  planned_count INTEGER DEFAULT 0,
  quarters TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE drift_task_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies for templates
CREATE POLICY "Users can view own templates"
  ON drift_task_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own templates"
  ON drift_task_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON drift_task_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON drift_task_templates FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for better performance
CREATE INDEX idx_drift_task_templates_user ON drift_task_templates(user_id);
CREATE INDEX idx_drift_task_templates_active ON drift_task_templates(is_active) WHERE is_active = true;

-- Add columns to drift_task_components for auto-detect
ALTER TABLE drift_task_components
ADD COLUMN IF NOT EXISTS auto_detected_from TEXT,
ADD COLUMN IF NOT EXISTS manually_edited BOOLEAN DEFAULT false;

-- Indexes for component search
CREATE INDEX IF NOT EXISTS idx_components_floor ON components(floor_id);
CREATE INDEX IF NOT EXISTS idx_components_name ON components(name);
CREATE INDEX IF NOT EXISTS idx_components_registration ON components(registration_number);

-- Add updated_at trigger for templates
CREATE TRIGGER set_drift_task_templates_updated_at
BEFORE UPDATE ON drift_task_templates
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();