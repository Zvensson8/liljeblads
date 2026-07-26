/**
 * Factory that bundles the standard list/create/update/delete TanStack
 * Query hooks for a given Supabase CRUD service. Reduces boilerplate
 * across the many entity hooks added in the consolidation pass.
 *
 * Notes:
 *  - `useList` accepts a filters object and is gated by an active
 *    session.
 *  - Mutations apply an optimistic snapshot update across every cached
 *    list query for the entity, rolling back on error.
 *  - Realtime invalidation is wired automatically when `realtimeTable`
 *    is provided.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeInvalidation } from '@/hooks/internal/useRealtimeInvalidation';
import type { CrudService } from '@/services/supabase';

interface EntityKeys {
  all: readonly unknown[];
  lists: () => readonly unknown[];
  list: (filters?: Record<string, unknown>) => readonly unknown[];
  details: () => readonly unknown[];
  detail: (id: string) => readonly unknown[];
}

export interface EntityHookLabels {
  createdToast?: string;
  updatedToast?: string;
  deletedToast?: string;
  createErrorTitle?: string;
  updateErrorTitle?: string;
  deleteErrorTitle?: string;
}

export interface CreateEntityHooksConfig<TRow, TInsert, TUpdate, TFilters> {
  service: CrudService<TRow, TInsert, TUpdate, TFilters>;
  keys: EntityKeys;
  realtimeTable?: string;
  labels?: EntityHookLabels;
  /** TanStack Query staleTime override (defaults to 2 min). */
  staleTime?: number;
  /** Disable session gating (for hooks that run unauthenticated). */
  skipSessionGate?: boolean;
}

export function createEntityHooks<
  TRow extends { id: string },
  TInsert,
  TUpdate,
  TFilters = unknown,
>(config: CreateEntityHooksConfig<TRow, TInsert, TUpdate, TFilters>) {
  const {
    service,
    keys,
    realtimeTable,
    labels = {},
    staleTime = 1000 * 60 * 2,
    skipSessionGate = false,
  } = config;

  function useList(filters: TFilters = {} as TFilters) {
    const { session } = useAuth();
    if (realtimeTable) {
      // Subscribe once per mounted hook; the underlying registry dedupes.
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useRealtimeInvalidation(realtimeTable, keys.all as QueryKey);
    }

    return useQuery<TRow[]>({
      queryKey: keys.list(filters as Record<string, unknown>) as QueryKey,
      queryFn: () => service.list(filters),
      enabled: skipSessionGate ? true : !!session,
      staleTime,
      gcTime: 1000 * 60 * 30,
    });
  }

  function useGetById(id: string | undefined) {
    const { session } = useAuth();
    return useQuery<TRow | null>({
      queryKey: keys.detail(id ?? '') as QueryKey,
      queryFn: () => (id ? service.getById(id) : Promise.resolve(null)),
      enabled: !!id && (skipSessionGate || !!session),
      staleTime,
      gcTime: 1000 * 60 * 30,
    });
  }

  function useCreate() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: (input: TInsert) => service.create(input),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: keys.all as QueryKey });
        if (labels.createdToast) toast({ title: labels.createdToast });
      },
      onError: (error: Error) => {
        toast({
          title: labels.createErrorTitle ?? 'Kunde inte skapa',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  }

  function useUpdate() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: TUpdate }) =>
        service.update(id, patch),
      onMutate: async ({ id, patch }) => {
        await queryClient.cancelQueries({ queryKey: keys.all as QueryKey });
        const snapshots = queryClient.getQueriesData<TRow[]>({
          queryKey: keys.all as QueryKey,
        });
        snapshots.forEach(([key, list]) => {
          if (!list) return;
          queryClient.setQueryData<TRow[]>(
            key,
            list.map((row) =>
              row.id === id
                ? ({ ...row, ...(patch as object) } as TRow)
                : row,
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
          title: labels.updateErrorTitle ?? 'Kunde inte uppdatera',
          description: error.message,
          variant: 'destructive',
        });
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: keys.all as QueryKey });
        if (labels.updatedToast) toast({ title: labels.updatedToast });
      },
    });
  }

  function useRemove() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: (id: string) => service.remove(id),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: keys.all as QueryKey });
        if (labels.deletedToast) toast({ title: labels.deletedToast });
      },
      onError: (error: Error) => {
        toast({
          title: labels.deleteErrorTitle ?? 'Kunde inte ta bort',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  }

  return { useList, useGetById, useCreate, useUpdate, useRemove };
}
