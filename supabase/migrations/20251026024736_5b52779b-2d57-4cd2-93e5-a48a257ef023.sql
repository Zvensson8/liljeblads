-- Uppdatera get_dashboard_stats för att räkna öppna (pending) todos
CREATE OR REPLACE FUNCTION get_dashboard_stats(property_ids UUID[])
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_work_orders', (SELECT COUNT(*) FROM work_orders WHERE property_id = ANY(property_ids)),
    'pending_work_orders', (SELECT COUNT(*) FROM work_orders WHERE property_id = ANY(property_ids) AND status IN ('not_started', 'awaiting_quote', 'ordered')),
    'total_projects', (SELECT COUNT(*) FROM projects WHERE property_id = ANY(property_ids)),
    'active_projects', (SELECT COUNT(*) FROM projects WHERE property_id = ANY(property_ids) AND status = 'pagaende'),
    'total_todos', (SELECT COUNT(*) FROM property_todos WHERE property_id = ANY(property_ids)),
    'pending_todos', (SELECT COUNT(*) FROM property_todos WHERE property_id = ANY(property_ids) AND completed = false),
    'completed_todos', (SELECT COUNT(*) FROM property_todos WHERE property_id = ANY(property_ids) AND completed = true),
    'recent_work_orders', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT wo.id, wo.action, wo.status, wo.priority, wo.created_at, wo.contractor, wo.due_date,
               json_build_object('name', p.name) as properties
        FROM work_orders wo
        JOIN properties p ON wo.property_id = p.id
        WHERE wo.property_id = ANY(property_ids)
          AND wo.status IN ('not_started', 'awaiting_quote', 'ordered')
        ORDER BY wo.created_at DESC
        LIMIT 5
      ) t
    ),
    'recent_projects', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT proj.id, proj.name, proj.status, proj.start_date, proj.end_date,
               json_build_object('name', p.name) as properties
        FROM projects proj
        JOIN properties p ON proj.property_id = p.id
        WHERE proj.property_id = ANY(property_ids)
          AND proj.status = 'pagaende'
        ORDER BY proj.start_date DESC
        LIMIT 5
      ) t
    ),
    'recent_todos', (
      SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
      FROM (
        SELECT todo.id, todo.title, todo.completed, todo.due_date,
               json_build_object('name', p.name) as properties
        FROM property_todos todo
        JOIN properties p ON todo.property_id = p.id
        WHERE todo.property_id = ANY(property_ids)
        ORDER BY todo.due_date ASC
        LIMIT 10
      ) t
    )
  ) INTO result;
  
  RETURN result;
END;
$$;