-- Add missing columns to property_todos table
ALTER TABLE property_todos 
ADD COLUMN IF NOT EXISTS parent_todo_id uuid REFERENCES property_todos(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS "order" integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS category text,
ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium';

-- Create index for parent_todo_id for better performance
CREATE INDEX IF NOT EXISTS idx_property_todos_parent_id ON property_todos(parent_todo_id);

-- Create function to auto-complete parent todo when all subtasks are completed
CREATE OR REPLACE FUNCTION auto_complete_parent_todo()
RETURNS TRIGGER AS $$
BEGIN
  -- If a subtask is being updated and has a parent
  IF NEW.parent_todo_id IS NOT NULL THEN
    -- Check if all siblings are now completed
    IF NOT EXISTS (
      SELECT 1 FROM property_todos 
      WHERE parent_todo_id = NEW.parent_todo_id 
      AND completed = false
      AND id != NEW.id
    ) AND NEW.completed = true THEN
      -- Mark parent as completed
      UPDATE property_todos 
      SET completed = true, updated_at = now()
      WHERE id = NEW.parent_todo_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-completing parent todos
DROP TRIGGER IF EXISTS trigger_auto_complete_parent ON property_todos;
CREATE TRIGGER trigger_auto_complete_parent
  AFTER UPDATE OF completed ON property_todos
  FOR EACH ROW
  EXECUTE FUNCTION auto_complete_parent_todo();

-- Create function to calculate todo progress
CREATE OR REPLACE FUNCTION calculate_todo_progress(todo_id uuid)
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'total', COUNT(*),
    'completed', COUNT(*) FILTER (WHERE completed = true)
  ) INTO result
  FROM property_todos
  WHERE parent_todo_id = todo_id;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;