-- Add drift_task_id column to maintenance_history for linking to drift tasks
ALTER TABLE maintenance_history 
ADD COLUMN drift_task_id UUID REFERENCES drift_tasks(id) ON DELETE SET NULL;

-- Index for faster lookups
CREATE INDEX idx_maintenance_history_drift_task ON maintenance_history(drift_task_id);

-- Trigger function to decrement reported_count when maintenance_history is deleted
CREATE OR REPLACE FUNCTION update_drift_task_on_maintenance_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.drift_task_id IS NOT NULL THEN
    UPDATE drift_tasks 
    SET reported_count = GREATEST(reported_count - 1, 0)
    WHERE id = OLD.drift_task_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to call the function before delete
CREATE TRIGGER maintenance_history_delete_trigger
BEFORE DELETE ON maintenance_history
FOR EACH ROW EXECUTE FUNCTION update_drift_task_on_maintenance_delete();

-- Also create a trigger to increment reported_count when maintenance_history is inserted with drift_task_id
CREATE OR REPLACE FUNCTION update_drift_task_on_maintenance_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.drift_task_id IS NOT NULL THEN
    UPDATE drift_tasks 
    SET reported_count = reported_count + 1
    WHERE id = NEW.drift_task_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER maintenance_history_insert_trigger
AFTER INSERT ON maintenance_history
FOR EACH ROW EXECUTE FUNCTION update_drift_task_on_maintenance_insert();