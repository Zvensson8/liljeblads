/**
 * Realtime subscription helper for Supabase tables.
 *
 * `subscribeToTable` opens (or reuses) a single channel per table and
 * notifies every registered listener on any postgres_change event. Returns
 * an unsubscribe function — the underlying channel is torn down once the
 * last listener detaches.
 *
 * Hooks use this instead of opening their own `supabase.channel(...)` so we
 * don't leak channels when multiple components mount the same hook.
 */
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type Listener = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;

interface Entry {
  channel: RealtimeChannel;
  listeners: Set<Listener>;
}

const registry = new Map<string, Entry>();

export function subscribeToTable(table: string, listener: Listener): () => void {
  let entry = registry.get(table);

  if (!entry) {
    const channel = supabase
      .channel(`realtime:${table}`)
      .on(
        // @ts-expect-error - Supabase's typing for postgres_changes is loose
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          const current = registry.get(table);
          current?.listeners.forEach((fn) => fn(payload));
        },
      )
      .subscribe();

    entry = { channel, listeners: new Set() };
    registry.set(table, entry);
  }

  entry.listeners.add(listener);

  return () => {
    const current = registry.get(table);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      supabase.removeChannel(current.channel);
      registry.delete(table);
    }
  };
}
