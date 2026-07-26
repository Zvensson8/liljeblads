/**
 * Maintenance history service — wraps the `maintenance_history` table.
 */
import { createCrudService } from './createCrudService';
import type {
  CreateMaintenanceHistoryInput,
  MaintenanceHistory,
  MaintenanceHistoryListFilters,
  UpdateMaintenanceHistoryInput,
} from '@/types/domain/maintenanceHistory';

export const maintenanceHistoryService = createCrudService<
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
