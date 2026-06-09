import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';
import type {
  WorkOrderWithRelations,
  WorkOrderListFilters,
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

const ACTIVE_STATUSES = ['not_started', 'awaiting_quote', 'ordered'] as const;
const ARCHIVED_STATUSES = ['completed', 'archived'] as const;

async function fetchWorkOrders(
  filters: WorkOrderListFilters
): Promise<WorkOrderWithRelations[]> {
  const statuses = filters.showArchived ? ARCHIVED_STATUSES : ACTIVE_STATUSES;

  let query = supabase
    .from('work_orders')
    .select(`
      *,
      properties (id, name),
      components (id, name, type)
    `)
    .in('status', [...statuses])
    .order('created_at', { ascending: false });

  if (filters.propertyId) query = query.eq('property_id', filters.propertyId);
  if (filters.projectId) query = query.eq('project_id', filters.projectId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as WorkOrderWithRelations[];
}

/**
 * Hook: fetch work orders with optional filters. Subscribes to realtime
 * changes on the `work_orders` table and invalidates cache on any change.
 *
 * Consumers can still use ad-hoc `useQuery(['work-orders', ...])` calls
 * during the migration — the query keys are kept compatible via the
 * `queryKeys.workOrders` registry.
 */
export function useWorkOrders(filters: WorkOrderListFilters = {}) {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const query = useQuery({
    queryKey: queryKeys.workOrders.list(filters),
    queryFn: () => fetchWorkOrders(filters),
    enabled: !!session,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
  });

  useEffect(() => {
    const channel = supabase
      .channel('work-orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.all });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useCreateWorkOrder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateWorkOrderInput) => {
      const { data, error } = await supabase
        .from('work_orders')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
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
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateWorkOrderInput;
    }) => {
      const { data, error } = await supabase
        .from('work_orders')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.all });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte uppdatera arbetsorder',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteWorkOrder() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('work_orders').delete().eq('id', id);
      if (error) throw error;
    },
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
