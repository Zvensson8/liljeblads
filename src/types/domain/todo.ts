import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';

/**
 * Domain schema for a Todo (property_todos table).
 *
 * Personal todos use `user_id = auth.uid()` for RLS isolation;
 * property-scoped todos use `property_id`.
 */

export const todoPrioritySchema = z.enum(['low', 'medium', 'high']);
export type TodoPriority = z.infer<typeof todoPrioritySchema>;

export const todoSchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid().nullable(),
  user_id: z.string().uuid().nullable(),
  title: z.string(),
  completed: z.boolean(),
  due_date: z.string().nullable(),
  notes: z.string().nullable(),
  reminder_date: z.string().nullable(),
  reminder_email: z.string().nullable(),
  parent_todo_id: z.string().uuid().nullable(),
  order: z.number().nullable(),
  category: z.string().nullable(),
  priority: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Todo = z.infer<typeof todoSchema>;

export type CreateTodoInput =
  Database['public']['Tables']['property_todos']['Insert'];
export type UpdateTodoInput =
  Database['public']['Tables']['property_todos']['Update'];

export interface TodoListFilters {
  propertyId?: string;
  userId?: string;
  completed?: boolean;
  parentTodoId?: string | null;
  category?: string;
}
