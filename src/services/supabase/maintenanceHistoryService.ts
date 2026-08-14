/**
 * Maintenance history service — wraps the `maintenance_history` table.
 */
import { supabase } from '@/integrations/supabase/client';
import { createCrudService } from './createCrudService';
import type {
  CreateMaintenanceHistoryInput,
  MaintenanceHistory,
  MaintenanceHistoryListFilters,
  UpdateMaintenanceHistoryInput,
} from '@/types/domain/maintenanceHistory';

const base = createCrudService<
  MaintenanceHistory,
  CreateMaintenanceHistoryInput,
  UpdateMaintenanceHistoryInput,
  MaintenanceHistoryListFilters
>({
  table: 'maintenance_history',
  defaultOrder: { column: 'performed_date', ascending: false },
  applyFilters: (query, filters) => {
    let q = query;
    if (filters.componentId) q = q.eq('component_id', filters.componentId);
    if (filters.category) q = q.eq('category', filters.category);
    if (filters.fromDate) q = q.gte('performed_date', filters.fromDate);
    if (filters.toDate) q = q.lte('performed_date', filters.toDate);
    return q;
  },
});

/** Latest service date per component — two columns only, no full history rows. */
async function lastServiceByComponent(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from('maintenance_history')
    .select('component_id, performed_date')
    .not('component_id', 'is', null)
    .order('performed_date', { ascending: false });
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.component_id && !(row.component_id in map)) {
      map[row.component_id] = row.performed_date;
    }
  }
  return map;
}

export const maintenanceHistoryService = {
  ...base,
  lastServiceByComponent,
};
