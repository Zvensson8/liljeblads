import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeInvalidation } from '@/hooks/internal/useRealtimeInvalidation';
import { queryKeys } from '@/lib/queryKeys';
import { maintenanceHistoryService } from '@/services/supabase';
import type {
  CreateMaintenanceHistoryInput,
  MaintenanceHistory,
  MaintenanceHistoryListFilters,
  UpdateMaintenanceHistoryInput,
} from '@/types/domain/maintenanceHistory';

export type {
  CreateMaintenanceHistoryInput,
  MaintenanceCategory,
  MaintenanceHistory,
  MaintenanceHistoryListFilters,
  UpdateMaintenanceHistoryInput,
} from '@/types/domain/maintenanceHistory';

/**
 * Hook: fetch maintenance history records with optional filters.
 * Subscribes to realtime changes on the `maintenance_history` table.
 */
export function useMaintenanceHistory(
  filters: MaintenanceHistoryListFilters = {},
) {
  const { session } = useAuth();

  useRealtimeInvalidation('maintenance_history', queryKeys.maintenanceHistory.all);

  return useQuery({
    queryKey: queryKeys.maintenanceHistory.list({ ...filters }),
    queryFn: () => maintenanceHistoryService.list(filters),
    enabled: !!session,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
  });
}

export function useCreateMaintenanceHistory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (input: CreateMaintenanceHistoryInput) =>
      maintenanceHistoryService.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.maintenanceHistory.all,
      });
      toast({ title: 'Underhåll registrerat' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte registrera underhåll',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateMaintenanceHistory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateMaintenanceHistoryInput;
    }) => maintenanceHistoryService.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.maintenanceHistory.all,
      });
      const snapshots = queryClient.getQueriesData<MaintenanceHistory[]>({
        queryKey: queryKeys.maintenanceHistory.all,
      });
      snapshots.forEach(([key, list]) => {
        if (!list) return;
        queryClient.setQueryData<MaintenanceHistory[]>(
          key,
          list.map((m) =>
            m.id === id ? ({ ...m, ...patch } as MaintenanceHistory) : m,
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
        title: 'Kunde inte uppdatera underhåll',
        description: error.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.maintenanceHistory.all,
      });
    },
  });
}

export function useDeleteMaintenanceHistory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => maintenanceHistoryService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.maintenanceHistory.all,
      });
      toast({ title: 'Underhåll borttaget' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte ta bort underhåll',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
