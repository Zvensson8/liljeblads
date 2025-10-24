-- Fix search path for auto_complete_parent_todo function
CREATE OR REPLACE FUNCTION auto_complete_parent_todo()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Fix search path for calculate_todo_progress function
CREATE OR REPLACE FUNCTION calculate_todo_progress(todo_id uuid)
RETURNS json 
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;