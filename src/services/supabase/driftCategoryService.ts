import { createCrudService } from './createCrudService';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type DriftCategory = Tables<'drift_categories'>;
export type DriftCategoryInsert = TablesInsert<'drift_categories'>;
export type DriftCategoryUpdate = TablesUpdate<'drift_categories'>;
export interface DriftCategoryFilters {
  organizationId?: string;
}

export const driftCategoryService = createCrudService<
  DriftCategory,
  DriftCategoryInsert,
  DriftCategoryUpdate,
  DriftCategoryFilters
>({
  table: 'drift_categories',
  defaultOrder: { column: 'name', ascending: true },
  applyFilters: (q, f) =>
    f.organizationId ? q.eq('organization_id', f.organizationId) : q,
});
