import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeInvalidation } from '@/hooks/internal/useRealtimeInvalidation';
import { queryKeys } from '@/lib/queryKeys';
import { driftTaskService } from '@/services/supabase';
import type {
  CreateDriftTaskInput,
  DriftTaskListFilters,
  DriftTaskWithRelations,
  UpdateDriftTaskInput,
} from '@/types/domain/driftTask';

export type {
  CreateDriftTaskInput,
  DriftTask,
  DriftTaskListFilters,
  DriftTaskWithRelations,
  Quarter,
  UpdateDriftTaskInput,
} from '@/types/domain/driftTask';

/**
 * Hook: fetch drift tasks with optional filters. Subscribes to realtime
 * changes on the `drift_tasks` table.
 */
export function useDriftTasks(filters: DriftTaskListFilters = {}) {
  const { session } = useAuth();

  useRealtimeInvalidation('drift_tasks', queryKeys.driftTasks.all);

  return useQuery({
    queryKey: queryKeys.driftTasks.list({ ...filters }),
    queryFn: () => driftTaskService.list(filters),
    enabled: !!session,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
  });
}

export function useCreateDriftTask() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (input: CreateDriftTaskInput) => driftTaskService.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.driftTasks.all });
      toast({ title: 'Driftuppgift skapad' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte skapa driftuppgift',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateDriftTask() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateDriftTaskInput }) =>
      driftTaskService.update(id, patch),
    // Optimistic — Operations module recalculates stats immediately (per project memory)
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.driftTasks.all });
      const snapshots = queryClient.getQueriesData<DriftTaskWithRelations[]>({
        queryKey: queryKeys.driftTasks.all,
      });
      snapshots.forEach(([key, list]) => {
        if (!list) return;
        queryClient.setQueryData<DriftTaskWithRelations[]>(
          key,
          list.map((t) =>
            t.id === id ? ({ ...t, ...patch } as DriftTaskWithRelations) : t,
          ),
        );
      });
      return { snapshots };
    },
    onError: (error: Error, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, list]) => {
        queryClient.setQueryData(key, list);
      });
      toast({
        title: 'Kunde inte uppdatera driftuppgift',
        description: error.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.driftTasks.all });
    },
  });
}

export function useDeleteDriftTask() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => driftTaskService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.driftTasks.all });
      toast({ title: 'Driftuppgift borttagen' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte ta bort driftuppgift',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
