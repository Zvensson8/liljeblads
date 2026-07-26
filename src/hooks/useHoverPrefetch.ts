import { useCallback, useRef } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

interface PrefetchTarget {
  queryKey: QueryKey;
  queryFn: () => Promise<unknown>;
  delayMs?: number;
}

/**
 * Prefetch data on hover/focus to make navigation feel instant.
 * Returns `{ onMouseEnter, onMouseLeave, onFocus }` props to spread
 * on a link, card, or button.
 *
 * Delay defaults to 150 ms so incidental hovers don't fire network calls.
 */
export function useHoverPrefetch({ queryKey, queryFn, delayMs = 150 }: PrefetchTarget) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      queryClient.prefetchQuery({ queryKey, queryFn, staleTime: 1000 * 30 });
    }, delayMs);
  }, [queryClient, queryKey, queryFn, delayMs]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onMouseEnter: start,
    onFocus: start,
    onMouseLeave: cancel,
    onBlur: cancel,
  };
}
