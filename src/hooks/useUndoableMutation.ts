import { useCallback, useRef } from 'react';
import { toast } from 'sonner';

interface UndoableConfig<TArgs> {
  /** Called if the user does NOT press undo within the timeout. */
  action: (args: TArgs) => Promise<unknown>;
  /** Toast label — e.g. "Todo borttagen". */
  label: string;
  /** How long the user has to press undo. Default 5 seconds. */
  timeoutMs?: number;
  /** Optional optimistic UI update; return a rollback fn used on undo. */
  optimistic?: (args: TArgs) => (() => void) | void;
  /** Toast shown after the action commits (fails silently by default). */
  onError?: (err: unknown) => void;
}

/**
 * Wraps a destructive mutation with an "Undo" toast. The real action
 * only fires after the timeout; if the user clicks undo, the optimistic
 * change is rolled back and no request is made.
 *
 * Pairs with TanStack Query — pass an `optimistic` callback that
 * removes the item from the cache and returns a rollback closure that
 * restores it.
 */
export function useUndoableMutation<TArgs>({
  action,
  label,
  timeoutMs = 5000,
  optimistic,
  onError,
}: UndoableConfig<TArgs>) {
  const inFlight = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  return useCallback(
    (args: TArgs) => {
      const rollbackRaw = optimistic?.(args);
      const rollback: (() => void) | undefined =
        typeof rollbackRaw === 'function' ? rollbackRaw : undefined;
      const key = crypto.randomUUID();

      const timer = setTimeout(async () => {
        inFlight.current.delete(key);
        try {
          await action(args);
        } catch (err) {
          rollback?.();
          onError?.(err);
        }
      }, timeoutMs);

      inFlight.current.set(key, timer);

      toast(label, {
        duration: timeoutMs,
        action: {
          label: 'Ångra',
          onClick: () => {
            const t = inFlight.current.get(key);
            if (t) clearTimeout(t);
            inFlight.current.delete(key);
            rollback?.();
          },
        },
      });
    },
    [action, label, timeoutMs, optimistic, onError],
  );
}
