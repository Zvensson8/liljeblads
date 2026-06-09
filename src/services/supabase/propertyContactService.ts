import { createCrudService } from './createCrudService';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type PropertyContact = Tables<'property_contacts'>;
export type PropertyContactInsert = TablesInsert<'property_contacts'>;
export type PropertyContactUpdate = TablesUpdate<'property_contacts'>;
export interface PropertyContactFilters {
  propertyId?: string;
}

export const propertyContactService = createCrudService<
  PropertyContact,
  PropertyContactInsert,
  PropertyContactUpdate,
  PropertyContactFilters
>({
  table: 'property_contacts',
  defaultOrder: { column: 'name', ascending: true },
  applyFilters: (q, f) =>
    f.propertyId ? q.eq('property_id', f.propertyId) : q,
});
