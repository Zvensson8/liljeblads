-- Add 'forslag' (proposal) status to project_status enum
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'forslag' BEFORE 'planerat';

-- Add source_document_id to ai_suggested_actions to track which document triggered the suggestion
ALTER TABLE ai_suggested_actions 
ADD COLUMN IF NOT EXISTS source_document_id UUID,
ADD COLUMN IF NOT EXISTS source_document_type TEXT;