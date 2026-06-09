import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';
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

async function fetchDriftTasks(
  filters: DriftTaskListFilters
): Promise<DriftTaskWithRelations[]> {
  let query = supabase
    .from('drift_tasks')
    .select(`
      *,
      drift_categories (id, name),
      properties (id, name)
    `)
    .order('created_at', { ascending: false });

  if (filters.propertyId) query = query.eq('property_id', filters.propertyId);
  if (filters.year) query = query.eq('year', filters.year);
  if (filters.quarter) query = query.eq('quarter', filters.quarter);
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as DriftTaskWithRelations[];
}

/**
 * Hook: fetch drift tasks with optional filters. Subscribes to realtime
 * changes on the `drift_tasks` table.
 */
export function useDriftTasks(filters: DriftTaskListFilters = {}) {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const query = useQuery({
    queryKey: queryKeys.driftTasks.list({ ...filters }),
    queryFn: () => fetchDriftTasks(filters),
    enabled: !!session,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
  });

  useEffect(() => {
    const channel = supabase
      .channel('drift-tasks-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drift_tasks' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.driftTasks.all });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useCreateDriftTask() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateDriftTaskInput) => {
      const { data, error } = await supabase
        .from('drift_tasks')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
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
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateDriftTaskInput;
    }) => {
      const { data, error } = await supabase
        .from('drift_tasks')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
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
            t.id === id ? ({ ...t, ...patch } as DriftTaskWithRelations) : t
          )
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
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('drift_tasks')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
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
