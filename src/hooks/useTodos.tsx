import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeInvalidation } from '@/hooks/internal/useRealtimeInvalidation';
import { queryKeys } from '@/lib/queryKeys';
import { todoService } from '@/services/supabase';
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

/**
 * Hook: fetch todos with optional filters. Subscribes to realtime
 * changes on the `property_todos` table.
 */
export function useTodos(filters: TodoListFilters = {}) {
  const { session } = useAuth();

  useRealtimeInvalidation('property_todos', queryKeys.todos.all);

  return useQuery({
    queryKey: queryKeys.todos.list({ ...filters }),
    queryFn: () => todoService.list(filters),
    enabled: !!session,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
  });
}

export function useCreateTodo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (input: CreateTodoInput) => todoService.create(input),
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
    mutationFn: ({ id, patch }: { id: string; patch: UpdateTodoInput }) =>
      todoService.update(id, patch),
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
          list.map((t) => (t.id === id ? ({ ...t, ...patch } as Todo) : t)),
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
    mutationFn: (id: string) => todoService.remove(id),
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
