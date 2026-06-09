import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';
import type {
  CreateTodoInput,
  Todo,
  TodoListFilters,
  UpdateTodoInput,
} from '@/types/domain/todo';

export type {
  CreateTodoInput,
  Todo,
  TodoListFilters,
  TodoPriority,
  UpdateTodoInput,
} from '@/types/domain/todo';

async function fetchTodos(filters: TodoListFilters): Promise<Todo[]> {
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

/**
 * Hook: fetch todos with optional filters. Subscribes to realtime
 * changes on the `property_todos` table.
 */
export function useTodos(filters: TodoListFilters = {}) {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const query = useQuery({
    queryKey: queryKeys.todos.list({ ...filters }),
    queryFn: () => fetchTodos(filters),
    enabled: !!session,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
  });

  useEffect(() => {
    const channel = supabase
      .channel('todos-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'property_todos' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useCreateTodo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateTodoInput) => {
      const { data, error } = await supabase
        .from('property_todos')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte skapa todo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateTodo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateTodoInput;
    }) => {
      const { data, error } = await supabase
        .from('property_todos')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    // Optimistic update — todo edits feel instant per project preferences
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.todos.all });
      const snapshots = queryClient.getQueriesData<Todo[]>({
        queryKey: queryKeys.todos.all,
      });
      snapshots.forEach(([key, list]) => {
        if (!list) return;
        queryClient.setQueryData<Todo[]>(
          key,
          list.map((t) => (t.id === id ? { ...t, ...patch } as Todo : t))
        );
      });
      return { snapshots };
    },
    onError: (error: Error, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, list]) => {
        queryClient.setQueryData(key, list);
      });
      toast({
        title: 'Kunde inte uppdatera todo',
        description: error.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
    },
  });
}

export function useDeleteTodo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('property_todos')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte ta bort todo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
