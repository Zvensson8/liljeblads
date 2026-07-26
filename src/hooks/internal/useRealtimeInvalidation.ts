/**
 * Tiny hook that wires a table-level realtime subscription to a
 * TanStack Query cache invalidation. Centralises the boilerplate that
 * used to live in every data hook.
 */
import { useEffect } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { subscribeToTable } from '@/services/supabase';

export function useRealtimeInvalidation(table: string, queryKey: QueryKey) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = subscribeToTable(table, () => {
      queryClient.invalidateQueries({ queryKey });
    });
    return unsubscribe;
    // queryKey identity changes per render; serialise to keep deps stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, JSON.stringify(queryKey), queryClient]);
}
