import { createCrudService } from './createCrudService';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type Floor = Tables<'floors'>;
export type FloorInsert = TablesInsert<'floors'>;
export type FloorUpdate = TablesUpdate<'floors'>;
export interface FloorListFilters {
  propertyId?: string;
}

export const floorService = createCrudService<Floor, FloorInsert, FloorUpdate, FloorListFilters>({
  table: 'floors',
  defaultOrder: { column: 'level', ascending: true },
  applyFilters: (q, f) => (f.propertyId ? q.eq('property_id', f.propertyId) : q),
});
