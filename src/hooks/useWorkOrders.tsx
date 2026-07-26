import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeInvalidation } from '@/hooks/internal/useRealtimeInvalidation';
import { queryKeys } from '@/lib/queryKeys';
import { workOrderService } from '@/services/supabase';
import type {
  WorkOrderListFilters,
  WorkOrderWithRelations,
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
} from '@/types/domain/workOrder';

export type {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderWithRelations,
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
} from '@/types/domain/workOrder';

/**
 * Hook: fetch work orders with optional filters. Subscribes to realtime
 * changes on the `work_orders` table and invalidates cache on any change.
 */
export function useWorkOrders(filters: WorkOrderListFilters = {}) {
  const { session } = useAuth();

  useRealtimeInvalidation('work_orders', queryKeys.workOrders.all);

  return useQuery({
    queryKey: queryKeys.workOrders.list({ ...filters }),
    queryFn: () => workOrderService.list(filters),
    enabled: !!session,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
  });
}

export function useCreateWorkOrder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (input: CreateWorkOrderInput) => workOrderService.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.all });
      toast({ title: 'Arbetsorder skapad' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte skapa arbetsorder',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateWorkOrder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateWorkOrderInput }) =>
      workOrderService.update(id, patch),
    // Optimistic — keep status changes feeling instant in lists.
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.workOrders.all });
      const snapshots = queryClient.getQueriesData<WorkOrderWithRelations[]>({
        queryKey: queryKeys.workOrders.all,
      });
      snapshots.forEach(([key, list]) => {
        if (!list) return;
        queryClient.setQueryData<WorkOrderWithRelations[]>(
          key,
          list.map((wo) =>
            wo.id === id ? ({ ...wo, ...patch } as WorkOrderWithRelations) : wo,
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
        title: 'Kunde inte uppdatera arbetsorder',
        description: error.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.all });
    },
  });
}

export function useDeleteWorkOrder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => workOrderService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.all });
      toast({ title: 'Arbetsorder borttagen' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte ta bort arbetsorder',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
