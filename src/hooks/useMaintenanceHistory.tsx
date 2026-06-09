import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';
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

async function fetchMaintenanceHistory(
  filters: MaintenanceHistoryListFilters
): Promise<MaintenanceHistory[]> {
  let query = supabase
    .from('maintenance_history')
    .select('*')
    .order('performed_date', { ascending: false });

  if (filters.componentId) query = query.eq('component_id', filters.componentId);
  if (filters.category) query = query.eq('category', filters.category);
  if (filters.fromDate) query = query.gte('performed_date', filters.fromDate);
  if (filters.toDate) query = query.lte('performed_date', filters.toDate);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as MaintenanceHistory[];
}

/**
 * Hook: fetch maintenance history records with optional filters.
 * Subscribes to realtime changes on the `maintenance_history` table.
 */
export function useMaintenanceHistory(
  filters: MaintenanceHistoryListFilters = {}
) {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const query = useQuery({
    queryKey: queryKeys.maintenanceHistory.list({ ...filters }),
    queryFn: () => fetchMaintenanceHistory(filters),
    enabled: !!session,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
  });

  useEffect(() => {
    const channel = supabase
      .channel('maintenance-history-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_history' },
        () => {
          queryClient.invalidateQueries({
            queryKey: queryKeys.maintenanceHistory.all,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useCreateMaintenanceHistory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateMaintenanceHistoryInput) => {
      const { data, error } = await supabase
        .from('maintenance_history')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
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
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateMaintenanceHistoryInput;
    }) => {
      const { data, error } = await supabase
        .from('maintenance_history')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.maintenanceHistory.all,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte uppdatera underhåll',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteMaintenanceHistory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('maintenance_history')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
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
