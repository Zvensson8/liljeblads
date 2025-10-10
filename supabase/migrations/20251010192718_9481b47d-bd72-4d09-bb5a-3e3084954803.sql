-- Fixa search_path för de nya funktionerna

DROP TRIGGER IF EXISTS update_planned_count_on_insert ON drift_task_components;
DROP TRIGGER IF EXISTS update_planned_count_on_delete ON drift_task_components;
DROP TRIGGER IF EXISTS sync_component_changes ON components;

-- Uppdatera funktionerna med search_path
CREATE OR REPLACE FUNCTION update_task_planned_count()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE drift_tasks
  SET planned_count = (
    SELECT COUNT(*)
    FROM drift_task_components
    WHERE task_id = COALESCE(NEW.task_id, OLD.task_id)
  )
  WHERE id = COALESCE(NEW.task_id, OLD.task_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION sync_component_data_to_task_objects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE drift_task_components
  SET 
    series_id = NEW.serial_number,
    registration_number = NEW.registration_number
  WHERE component_id = NEW.id;
  
  RETURN NEW;
END;
$$;

-- Återskapa triggers
CREATE TRIGGER update_planned_count_on_insert
AFTER INSERT ON drift_task_components
FOR EACH ROW
EXECUTE FUNCTION update_task_planned_count();

CREATE TRIGGER update_planned_count_on_delete
AFTER DELETE ON drift_task_components
FOR EACH ROW
EXECUTE FUNCTION update_task_planned_count();

CREATE TRIGGER sync_component_changes
AFTER UPDATE OF serial_number, registration_number ON components
FOR EACH ROW
WHEN (OLD.serial_number IS DISTINCT FROM NEW.serial_number 
      OR OLD.registration_number IS DISTINCT FROM NEW.registration_number)
EXECUTE FUNCTION sync_component_data_to_task_objects();