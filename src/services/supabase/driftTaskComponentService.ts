/**
 * Service for the `drift_task_components` join table.
 *
 * Loads with the embedded `component` row so consumers (QuarterCard) can
 * render component metadata without a second round-trip.
 */
import { createCrudService } from './createCrudService';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type DriftTaskComponent = Tables<'drift_task_components'> & {
  component?: {
    id: string;
    name: string;
    type: string;
    room_zone: string | null;
    floor_id: string;
    serial_number: string | null;
    registration_number: string | null;
  } | null;
};
export type DriftTaskComponentInsert = TablesInsert<'drift_task_components'>;
export type DriftTaskComponentUpdate = TablesUpdate<'drift_task_components'>;

export interface DriftTaskComponentFilters {
  taskId?: string;
  taskIds?: string[];
}

export const driftTaskComponentService = createCrudService<
  DriftTaskComponent,
  DriftTaskComponentInsert,
  DriftTaskComponentUpdate,
  DriftTaskComponentFilters
>({
  table: 'drift_task_components',
  select: `
    id,
    task_id,
    component_id,
    object_name,
    is_reported,
    series_id,
    registration_number,
    auto_detected_from,
    manually_edited,
    component:components (
      id,
      name,
      type,
      room_zone,
      floor_id,
      serial_number,
      registration_number
    )
  `,
  applyFilters: (q, f) => {
    let r = q;
    if (f.taskId) r = r.eq('task_id', f.taskId);
    if (f.taskIds && f.taskIds.length > 0) r = r.in('task_id', f.taskIds);
    return r;
  },
});

/** Bulk-delete a set of drift_tasks by id. Used by bulk actions. */
export async function deleteDriftTasksByIds(ids: string[]) {
  if (ids.length === 0) return;
  const { supabase } = await import('@/integrations/supabase/client');
  const { error } = await supabase.from('drift_tasks').delete().in('id', ids);
  if (error) throw error;
}
