
-- Drop existing triggers if any
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
