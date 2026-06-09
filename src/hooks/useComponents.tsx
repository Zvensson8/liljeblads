import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';
import type {
  ComponentListFilters,
  ComponentWithRelations,
  CreateComponentInput,
  UpdateComponentInput,
} from '@/types/domain/component';

export type {
  Component,
  ComponentStatus,
  ComponentType,
  ComponentWithRelations,
  CreateComponentInput,
  UpdateComponentInput,
} from '@/types/domain/component';

async function fetchComponents(
  filters: ComponentListFilters
): Promise<ComponentWithRelations[]> {
  let query = supabase
    .from('components')
    .select(`
      *,
      floors (id, name),
      properties (id, name)
    `)
    .order('created_at', { ascending: false });

  if (filters.propertyId) query = query.eq('property_id', filters.propertyId);
  if (filters.floorId) query = query.eq('floor_id', filters.floorId);
  if (filters.type) query = query.eq('type', filters.type);
  if (filters.status) query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as ComponentWithRelations[];
}

/**
 * Hook: fetch components with optional filters. Subscribes to realtime
 * changes on the `components` table.
 */
export function useComponents(filters: ComponentListFilters = {}) {
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const query = useQuery({
    queryKey: queryKeys.components.list({ ...filters }),
    queryFn: () => fetchComponents(filters),
    enabled: !!session,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
  });

  useEffect(() => {
    const channel = supabase
      .channel('components-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'components' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.components.all });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useCreateComponent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateComponentInput) => {
      const { data, error } = await supabase
        .from('components')
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.components.all });
      toast({ title: 'Komponent skapad' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte skapa komponent',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateComponent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateComponentInput;
    }) => {
      const { data, error } = await supabase
        .from('components')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.components.all });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte uppdatera komponent',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteComponent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('components').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.components.all });
      toast({ title: 'Komponent borttagen' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte ta bort komponent',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
