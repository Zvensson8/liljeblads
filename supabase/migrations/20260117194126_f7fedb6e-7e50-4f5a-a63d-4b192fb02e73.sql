
-- Create or replace embedding queue functions for each table

-- Properties
CREATE OR REPLACE FUNCTION public.queue_property_embedding()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Components
CREATE OR REPLACE FUNCTION public.queue_component_embedding()
RETURNS TRIGGER AS $$
DECLARE
  org_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT organization_id INTO org_id FROM properties WHERE id = OLD.property_id;
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('components', OLD.id, 'delete', org_id);
    RETURN OLD;
  ELSE
    SELECT organization_id INTO org_id FROM properties WHERE id = NEW.property_id;
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('components', NEW.id, TG_OP, org_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Work Orders
CREATE OR REPLACE FUNCTION public.queue_work_order_embedding()
RETURNS TRIGGER AS $$
DECLARE
  org_id uuid;
  prop_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT property_id INTO prop_id FROM components WHERE id = OLD.component_id;
    SELECT organization_id INTO org_id FROM properties WHERE id = prop_id;
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('work_orders', OLD.id, 'delete', org_id);
    RETURN OLD;
  ELSE
    SELECT property_id INTO prop_id FROM components WHERE id = NEW.component_id;
    SELECT organization_id INTO org_id FROM properties WHERE id = prop_id;
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('work_orders', NEW.id, TG_OP, org_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Projects
CREATE OR REPLACE FUNCTION public.queue_project_embedding()
RETURNS TRIGGER AS $$
DECLARE
  org_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT organization_id INTO org_id FROM properties WHERE id = OLD.property_id;
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('projects', OLD.id, 'delete', org_id);
    RETURN OLD;
  ELSE
    SELECT organization_id INTO org_id FROM properties WHERE id = NEW.property_id;
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('projects', NEW.id, TG_OP, org_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Property Todos
CREATE OR REPLACE FUNCTION public.queue_todo_embedding()
RETURNS TRIGGER AS $$
DECLARE
  org_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.property_id IS NOT NULL THEN
      SELECT organization_id INTO org_id FROM properties WHERE id = OLD.property_id;
    END IF;
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('property_todos', OLD.id, 'delete', org_id);
    RETURN OLD;
  ELSE
    IF NEW.property_id IS NOT NULL THEN
      SELECT organization_id INTO org_id FROM properties WHERE id = NEW.property_id;
    END IF;
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('property_todos', NEW.id, TG_OP, org_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drift Tasks
CREATE OR REPLACE FUNCTION public.queue_drift_task_embedding()
RETURNS TRIGGER AS $$
DECLARE
  org_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT organization_id INTO org_id FROM properties WHERE id = OLD.property_id;
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('drift_tasks', OLD.id, 'delete', org_id);
    RETURN OLD;
  ELSE
    SELECT organization_id INTO org_id FROM properties WHERE id = NEW.property_id;
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('drift_tasks', NEW.id, TG_OP, org_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Maintenance History
CREATE OR REPLACE FUNCTION public.queue_maintenance_embedding()
RETURNS TRIGGER AS $$
DECLARE
  org_id uuid;
  prop_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT property_id INTO prop_id FROM components WHERE id = OLD.component_id;
    SELECT organization_id INTO org_id FROM properties WHERE id = prop_id;
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('maintenance_history', OLD.id, 'delete', org_id);
    RETURN OLD;
  ELSE
    SELECT property_id INTO prop_id FROM components WHERE id = NEW.component_id;
    SELECT organization_id INTO org_id FROM properties WHERE id = prop_id;
    INSERT INTO embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('maintenance_history', NEW.id, TG_OP, org_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing triggers if they exist and recreate
DROP TRIGGER IF EXISTS properties_embedding_trigger ON properties;
DROP TRIGGER IF EXISTS components_embedding_trigger ON components;
DROP TRIGGER IF EXISTS work_orders_embedding_trigger ON work_orders;
DROP TRIGGER IF EXISTS projects_embedding_trigger ON projects;
DROP TRIGGER IF EXISTS property_todos_embedding_trigger ON property_todos;
DROP TRIGGER IF EXISTS drift_tasks_embedding_trigger ON drift_tasks;
DROP TRIGGER IF EXISTS maintenance_history_embedding_trigger ON maintenance_history;

-- Create triggers
CREATE TRIGGER properties_embedding_trigger
  AFTER INSERT OR UPDATE OR DELETE ON properties
  FOR EACH ROW
  EXECUTE FUNCTION queue_property_embedding();

CREATE TRIGGER components_embedding_trigger
  AFTER INSERT OR UPDATE OR DELETE ON components
  FOR EACH ROW
  EXECUTE FUNCTION queue_component_embedding();

CREATE TRIGGER work_orders_embedding_trigger
  AFTER INSERT OR UPDATE OR DELETE ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION queue_work_order_embedding();

CREATE TRIGGER projects_embedding_trigger
  AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION queue_project_embedding();

CREATE TRIGGER property_todos_embedding_trigger
  AFTER INSERT OR UPDATE OR DELETE ON property_todos
  FOR EACH ROW
  EXECUTE FUNCTION queue_todo_embedding();

CREATE TRIGGER drift_tasks_embedding_trigger
  AFTER INSERT OR UPDATE OR DELETE ON drift_tasks
  FOR EACH ROW
  EXECUTE FUNCTION queue_drift_task_embedding();

CREATE TRIGGER maintenance_history_embedding_trigger
  AFTER INSERT OR UPDATE OR DELETE ON maintenance_history
  FOR EACH ROW
  EXECUTE FUNCTION queue_maintenance_embedding();
