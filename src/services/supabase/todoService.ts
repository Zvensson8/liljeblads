/**
 * Todo service — wraps the `property_todos` table with the
 * `order then created_at` ordering and supports nullable parent filters.
 */
import { supabase } from '@/integrations/supabase/client';
import { createCrudService } from './createCrudService';
import type {
  CreateTodoInput,
  Todo,
  TodoListFilters,
  UpdateTodoInput,
} from '@/types/domain/todo';

const base = createCrudService<Todo, CreateTodoInput, UpdateTodoInput, TodoListFilters>({
  table: 'property_todos',
});

async function list(filters: TodoListFilters = {}): Promise<Todo[]> {
  let query = supabase
    .from('property_todos')
    .select('*')
    .order('order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (filters.propertyId) query = query.eq('property_id', filters.propertyId);
  if (filters.userId) query = query.eq('user_id', filters.userId);
  if (filters.completed !== undefined) query = query.eq('completed', filters.completed);
  if (filters.parentTodoId === null) query = query.is('parent_todo_id', null);
  else if (filters.parentTodoId) query = query.eq('parent_todo_id', filters.parentTodoId);
  if (filters.category) query = query.eq('category', filters.category);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Todo[];
}

export const todoService = {
  ...base,
  list,
};
