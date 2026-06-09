/**
 * Component service — wraps the `components` table with floor + property
 * joins.
 */
import { createCrudService } from './createCrudService';
import type {
  ComponentListFilters,
  ComponentWithRelations,
  CreateComponentInput,
  UpdateComponentInput,
} from '@/types/domain/component';

export const componentService = createCrudService<
  ComponentWithRelations,
  CreateComponentInput,
  UpdateComponentInput,
  ComponentListFilters
>({
  table: 'components',
  select: `
    *,
    floors (id, name, level),
    properties (id, name, address)
  `,
  defaultOrder: { column: 'created_at', ascending: false },
  applyFilters: (query, filters) => {
    let q = query;
    if (filters.propertyId) q = q.eq('property_id', filters.propertyId);
    if (filters.floorId) q = q.eq('floor_id', filters.floorId);
    if (filters.type) q = q.eq('type', filters.type);
    if (filters.status) q = q.eq('status', filters.status);
    return q;
  },
});
