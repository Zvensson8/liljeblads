-- Create embedding queue functions for drift_tasks and maintenance_history

-- Function to queue drift task embedding
CREATE OR REPLACE FUNCTION public.queue_drift_task_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  org_id uuid;
BEGIN
  -- Get organization_id from property
  IF TG_OP = 'DELETE' THEN
    SELECT p.organization_id INTO org_id
    FROM properties p
    WHERE p.id = OLD.property_id;
    
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('drift_tasks', OLD.id, 'delete', org_id);
    
    RETURN OLD;
  ELSE
    SELECT p.organization_id INTO org_id
    FROM properties p
    WHERE p.id = NEW.property_id;
    
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('drift_tasks', NEW.id, TG_OP, org_id);
    
    RETURN NEW;
  END IF;
END;
$$;

-- Function to queue maintenance history embedding
CREATE OR REPLACE FUNCTION public.queue_maintenance_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  org_id uuid;
BEGIN
  -- Get organization_id through component -> property
  IF TG_OP = 'DELETE' THEN
    SELECT p.organization_id INTO org_id
    FROM components c
    JOIN properties p ON p.id = c.property_id
    WHERE c.id = OLD.component_id;
    
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('maintenance_history', OLD.id, 'delete', org_id);
    
    RETURN OLD;
  ELSE
    SELECT p.organization_id INTO org_id
    FROM components c
    JOIN properties p ON p.id = c.property_id
    WHERE c.id = NEW.component_id;
    
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('maintenance_history', NEW.id, TG_OP, org_id);
    
    RETURN NEW;
  END IF;
END;
$$;

-- Function to queue property embedding
CREATE OR REPLACE FUNCTION public.queue_property_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('properties', OLD.id, 'delete', OLD.organization_id);
    RETURN OLD;
  ELSE
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('properties', NEW.id, TG_OP, NEW.organization_id);
    RETURN NEW;
  END IF;
END;
$$;

-- Create triggers for all tables

-- Drift tasks trigger
DROP TRIGGER IF EXISTS drift_tasks_embedding_trigger ON drift_tasks;
CREATE TRIGGER drift_tasks_embedding_trigger
  AFTER INSERT OR UPDATE OR DELETE ON drift_tasks
  FOR EACH ROW
  EXECUTE FUNCTION queue_drift_task_embedding();

-- Maintenance history trigger
DROP TRIGGER IF EXISTS maintenance_history_embedding_trigger ON maintenance_history;
CREATE TRIGGER maintenance_history_embedding_trigger
  AFTER INSERT OR UPDATE OR DELETE ON maintenance_history
  FOR EACH ROW
  EXECUTE FUNCTION queue_maintenance_embedding();

-- Properties trigger
DROP TRIGGER IF EXISTS properties_embedding_trigger ON properties;
CREATE TRIGGER properties_embedding_trigger
  AFTER INSERT OR UPDATE OR DELETE ON properties
  FOR EACH ROW
  EXECUTE FUNCTION queue_property_embedding();

-- Components trigger (ensure it exists)
CREATE OR REPLACE FUNCTION public.queue_component_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  org_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT p.organization_id INTO org_id
    FROM properties p
    WHERE p.id = OLD.property_id;
    
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('components', OLD.id, 'delete', org_id);
    
    RETURN OLD;
  ELSE
    SELECT p.organization_id INTO org_id
    FROM properties p
    WHERE p.id = NEW.property_id;
    
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('components', NEW.id, TG_OP, org_id);
    
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS components_embedding_trigger ON components;
CREATE TRIGGER components_embedding_trigger
  AFTER INSERT OR UPDATE OR DELETE ON components
  FOR EACH ROW
  EXECUTE FUNCTION queue_component_embedding();

-- Work orders trigger
CREATE OR REPLACE FUNCTION public.queue_work_order_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  org_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT p.organization_id INTO org_id
    FROM components c
    JOIN properties p ON p.id = c.property_id
    WHERE c.id = OLD.component_id;
    
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('work_orders', OLD.id, 'delete', org_id);
    
    RETURN OLD;
  ELSE
    SELECT p.organization_id INTO org_id
    FROM components c
    JOIN properties p ON p.id = c.property_id
    WHERE c.id = NEW.component_id;
    
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('work_orders', NEW.id, TG_OP, org_id);
    
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS work_orders_embedding_trigger ON work_orders;
CREATE TRIGGER work_orders_embedding_trigger
  AFTER INSERT OR UPDATE OR DELETE ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION queue_work_order_embedding();

-- Projects trigger
CREATE OR REPLACE FUNCTION public.queue_project_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  org_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT p.organization_id INTO org_id
    FROM properties p
    WHERE p.id = OLD.property_id;
    
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('projects', OLD.id, 'delete', org_id);
    
    RETURN OLD;
  ELSE
    SELECT p.organization_id INTO org_id
    FROM properties p
    WHERE p.id = NEW.property_id;
    
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('projects', NEW.id, TG_OP, org_id);
    
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS projects_embedding_trigger ON projects;
CREATE TRIGGER projects_embedding_trigger
  AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION queue_project_embedding();

-- Property todos trigger
CREATE OR REPLACE FUNCTION public.queue_todo_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  org_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT p.organization_id INTO org_id
    FROM properties p
    WHERE p.id = OLD.property_id;
    
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('property_todos', OLD.id, 'delete', org_id);
    
    RETURN OLD;
  ELSE
    SELECT p.organization_id INTO org_id
    FROM properties p
    WHERE p.id = NEW.property_id;
    
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('property_todos', NEW.id, TG_OP, org_id);
    
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS property_todos_embedding_trigger ON property_todos;
CREATE TRIGGER property_todos_embedding_trigger
  AFTER INSERT OR UPDATE OR DELETE ON property_todos
  FOR EACH ROW
  EXECUTE FUNCTION queue_todo_embedding();