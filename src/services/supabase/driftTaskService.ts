/**
 * Drift task service — wraps the `drift_tasks` table with category +
 * property joins.
 */
import { createCrudService } from './createCrudService';
import type {
  CreateDriftTaskInput,
  DriftTaskListFilters,
  DriftTaskWithRelations,
  UpdateDriftTaskInput,
} from '@/types/domain/driftTask';

export const driftTaskService = createCrudService<
  DriftTaskWithRelations,
  CreateDriftTaskInput,
  UpdateDriftTaskInput,
  DriftTaskListFilters
>({
  table: 'drift_tasks',
  select: `
    *,
    drift_categories (id, name),
    properties (id, name)
  `,
  defaultOrder: { column: 'created_at', ascending: false },
  applyFilters: (query, filters) => {
    let q = query;
    if (filters.propertyId) q = q.eq('property_id', filters.propertyId);
    if (filters.year) q = q.eq('year', filters.year);
    if (filters.quarter) q = q.eq('quarter', filters.quarter);
    if (filters.categoryId) q = q.eq('category_id', filters.categoryId);
    return q;
  },
});
