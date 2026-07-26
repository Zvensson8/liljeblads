-- Steg 1: Uppdatera triggerfunktionen för att använda property_id istället för component_id
CREATE OR REPLACE FUNCTION queue_work_order_embedding()
RETURNS TRIGGER AS $$
DECLARE
  org_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Hämta organization_id via property_id
    SELECT organization_id INTO org_id 
    FROM properties 
    WHERE id = OLD.property_id;
    
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('work_orders', OLD.id, 'delete', org_id);
    RETURN OLD;
  ELSE
    -- Hämta organization_id via property_id
    SELECT organization_id INTO org_id 
    FROM properties 
    WHERE id = NEW.property_id;
    
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('work_orders', NEW.id, TG_OP, org_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Steg 2: Ta bort duplicerad trigger
DROP TRIGGER IF EXISTS work_orders_embedding_trigger ON work_orders;