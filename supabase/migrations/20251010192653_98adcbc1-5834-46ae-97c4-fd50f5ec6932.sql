-- Steg 1: Förbättra dataintegritet

-- Lägg till UNIQUE constraint för att förhindra dubbletter
ALTER TABLE drift_task_components 
ADD CONSTRAINT drift_task_components_task_component_unique 
UNIQUE (task_id, component_id);

-- Uppdatera foreign key till components med CASCADE DELETE
ALTER TABLE drift_task_components
DROP CONSTRAINT IF EXISTS drift_task_components_component_id_fkey;

ALTER TABLE drift_task_components
ADD CONSTRAINT drift_task_components_component_id_fkey
FOREIGN KEY (component_id)
REFERENCES components(id)
ON DELETE CASCADE;

-- Uppdatera foreign key till drift_tasks med CASCADE DELETE
ALTER TABLE drift_task_components
DROP CONSTRAINT IF EXISTS drift_task_components_task_id_fkey;

ALTER TABLE drift_task_components
ADD CONSTRAINT drift_task_components_task_id_fkey
FOREIGN KEY (task_id)
REFERENCES drift_tasks(id)
ON DELETE CASCADE;

-- Trigger för att automatiskt uppdatera planned_count
CREATE OR REPLACE FUNCTION update_task_planned_count()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_planned_count_on_insert
AFTER INSERT ON drift_task_components
FOR EACH ROW
EXECUTE FUNCTION update_task_planned_count();

CREATE TRIGGER update_planned_count_on_delete
AFTER DELETE ON drift_task_components
FOR EACH ROW
EXECUTE FUNCTION update_task_planned_count();

-- Steg 2: Automatisk datasynkronisering från komponenter

CREATE OR REPLACE FUNCTION sync_component_data_to_task_objects()
RETURNS TRIGGER AS $$
BEGIN
  -- Uppdatera series_id och registration_number i drift_task_components
  UPDATE drift_task_components
  SET 
    series_id = NEW.serial_number,
    registration_number = NEW.registration_number
  WHERE component_id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER sync_component_changes
AFTER UPDATE OF serial_number, registration_number ON components
FOR EACH ROW
WHEN (OLD.serial_number IS DISTINCT FROM NEW.serial_number 
      OR OLD.registration_number IS DISTINCT FROM NEW.registration_number)
EXECUTE FUNCTION sync_component_data_to_task_objects();