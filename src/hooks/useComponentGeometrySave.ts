import { useCallback, useEffect, useRef } from 'react';
import { debounce } from 'lodash-es';
import { supabase } from '@/integrations/supabase/client';

/**
 * Debounced upsert of component canvas position.
 * Cancels pending writes on unmount to avoid setState-after-unmount races.
 */
export function useComponentGeometrySave(opts?: {
  debounceMs?: number;
  onError?: (message: string) => void;
  onSuccess?: () => void;
}) {
  const lastSaved = useRef<Map<string, { x: number; y: number }>>(new Map());
  const onErrorRef = useRef(opts?.onError);
  const onSuccessRef = useRef(opts?.onSuccess);
  onErrorRef.current = opts?.onError;
  onSuccessRef.current = opts?.onSuccess;

  const debouncedSave = useRef(
    debounce(async (componentId: string, x: number, y: number) => {
      const last = lastSaved.current.get(componentId);
      if (last && last.x === x && last.y === y) return;

      const { error: delErr } = await supabase
        .from('component_geometry')
        .delete()
        .eq('component_id', componentId);
      if (delErr) {
        onErrorRef.current?.(delErr.message);
        return;
      }

      const { error } = await supabase.from('component_geometry').insert({
        component_id: componentId,
        x,
        y,
      });

      if (error) {
        onErrorRef.current?.(error.message);
        return;
      }
      lastSaved.current.set(componentId, { x, y });
      onSuccessRef.current?.();
    }, opts?.debounceMs ?? 500),
  );

  useEffect(() => {
    const fn = debouncedSave.current;
    return () => {
      fn.cancel();
    };
  }, []);

  const rememberPosition = useCallback((componentId: string, x: number, y: number) => {
    lastSaved.current.set(componentId, { x, y });
  }, []);

  const savePosition = useCallback((componentId: string, x: number, y: number) => {
    if (!componentId || !Number.isFinite(x) || !Number.isFinite(y)) return;
    debouncedSave.current(componentId, x, y);
  }, []);

  const savePositionNow = useCallback(async (componentId: string, x: number, y: number) => {
    debouncedSave.current.cancel();
    if (!componentId || !Number.isFinite(x) || !Number.isFinite(y)) {
      return { ok: false as const, error: 'Ogiltig position' };
    }
    const { error: delErr } = await supabase
      .from('component_geometry')
      .delete()
      .eq('component_id', componentId);
    if (delErr) return { ok: false as const, error: delErr.message };

    const { error } = await supabase.from('component_geometry').insert({
      component_id: componentId,
      x,
      y,
    });
    if (error) return { ok: false as const, error: error.message };

    lastSaved.current.set(componentId, { x, y });
    return { ok: true as const };
  }, []);

  return { savePosition, savePositionNow, rememberPosition, lastSaved };
}
