-- Add trigger for properties to queue embeddings on changes
CREATE OR REPLACE FUNCTION queue_property_embedding()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('properties', OLD.id, 'delete', OLD.organization_id);
    RETURN OLD;
  ELSE
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('properties', NEW.id, 'update', NEW.organization_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_queue_property_embedding ON properties;

-- Create trigger for properties
CREATE TRIGGER trigger_queue_property_embedding
AFTER INSERT OR UPDATE OR DELETE ON properties
FOR EACH ROW EXECUTE FUNCTION queue_property_embedding();

-- Backfill: Queue all existing properties for embedding generation
INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
SELECT 'properties', id, 'update', organization_id
FROM properties;

-- Also backfill components
INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
SELECT 'components', c.id, 'update', p.organization_id
FROM components c
JOIN properties p ON c.property_id = p.id;

-- Backfill projects
INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
SELECT 'projects', pr.id, 'update', p.organization_id
FROM projects pr
JOIN properties p ON pr.property_id = p.id;