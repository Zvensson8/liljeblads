import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeInvalidation } from '@/hooks/internal/useRealtimeInvalidation';
import { queryKeys } from '@/lib/queryKeys';
import { componentService } from '@/services/supabase';
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

/**
 * Hook: fetch components with optional filters. Subscribes to realtime
 * changes on the `components` table.
 */
export function useComponents(filters: ComponentListFilters = {}) {
  const { session } = useAuth();

  useRealtimeInvalidation('components', queryKeys.components.all);

  return useQuery({
    queryKey: queryKeys.components.list({ ...filters }),
    queryFn: () => componentService.list(filters),
    enabled: !!session,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
  });
}

export function useCreateComponent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (input: CreateComponentInput) => componentService.create(input),
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
    mutationFn: ({ id, patch }: { id: string; patch: UpdateComponentInput }) =>
      componentService.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.components.all });
      const snapshots = queryClient.getQueriesData<ComponentWithRelations[]>({
        queryKey: queryKeys.components.all,
      });
      snapshots.forEach(([key, list]) => {
        if (!list) return;
        queryClient.setQueryData<ComponentWithRelations[]>(
          key,
          list.map((c) =>
            c.id === id ? ({ ...c, ...patch } as ComponentWithRelations) : c,
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
        title: 'Kunde inte uppdatera komponent',
        description: error.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.components.all });
    },
  });
}

export function useDeleteComponent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (id: string) => componentService.remove(id),
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
