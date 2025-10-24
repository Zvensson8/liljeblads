-- Add version control columns to document tables
ALTER TABLE component_documents
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_version_id UUID REFERENCES component_documents(id),
ADD COLUMN IF NOT EXISTS is_latest BOOLEAN DEFAULT true;

ALTER TABLE property_documents
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_version_id UUID REFERENCES property_documents(id),
ADD COLUMN IF NOT EXISTS is_latest BOOLEAN DEFAULT true;

ALTER TABLE project_documents
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_version_id UUID REFERENCES project_documents(id),
ADD COLUMN IF NOT EXISTS is_latest BOOLEAN DEFAULT true;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_component_documents_parent ON component_documents(parent_version_id);
CREATE INDEX IF NOT EXISTS idx_component_documents_latest ON component_documents(is_latest) WHERE is_latest = true;

CREATE INDEX IF NOT EXISTS idx_property_documents_parent ON property_documents(parent_version_id);
CREATE INDEX IF NOT EXISTS idx_property_documents_latest ON property_documents(is_latest) WHERE is_latest = true;

CREATE INDEX IF NOT EXISTS idx_project_documents_parent ON project_documents(parent_version_id);
CREATE INDEX IF NOT EXISTS idx_project_documents_latest ON project_documents(is_latest) WHERE is_latest = true;

-- Create function to handle version incrementing
CREATE OR REPLACE FUNCTION public.increment_document_version()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  -- Mark previous versions as not latest
  IF TG_TABLE_NAME = 'component_documents' THEN
    UPDATE component_documents 
    SET is_latest = false 
    WHERE component_id = NEW.component_id 
    AND name = NEW.name 
    AND id != NEW.id;
  ELSIF TG_TABLE_NAME = 'property_documents' THEN
    UPDATE property_documents 
    SET is_latest = false 
    WHERE property_id = NEW.property_id 
    AND name = NEW.name 
    AND id != NEW.id;
  ELSIF TG_TABLE_NAME = 'project_documents' THEN
    UPDATE project_documents 
    SET is_latest = false 
    WHERE project_id = NEW.project_id 
    AND name = NEW.name 
    AND id != NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create triggers for version control
DROP TRIGGER IF EXISTS component_documents_version_trigger ON component_documents;
CREATE TRIGGER component_documents_version_trigger
AFTER INSERT ON component_documents
FOR EACH ROW
EXECUTE FUNCTION increment_document_version();

DROP TRIGGER IF EXISTS property_documents_version_trigger ON property_documents;
CREATE TRIGGER property_documents_version_trigger
AFTER INSERT ON property_documents
FOR EACH ROW
EXECUTE FUNCTION increment_document_version();

DROP TRIGGER IF EXISTS project_documents_version_trigger ON project_documents;
CREATE TRIGGER project_documents_version_trigger
AFTER INSERT ON project_documents
FOR EACH ROW
EXECUTE FUNCTION increment_document_version();