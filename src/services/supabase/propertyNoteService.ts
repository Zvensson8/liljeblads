import { createCrudService } from './createCrudService';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type PropertyNote = Tables<'property_notes'>;
export type PropertyNoteInsert = TablesInsert<'property_notes'>;
export type PropertyNoteUpdate = TablesUpdate<'property_notes'>;
export interface PropertyNoteFilters {
  propertyId?: string;
}

export const propertyNoteService = createCrudService<
  PropertyNote,
  PropertyNoteInsert,
  PropertyNoteUpdate,
  PropertyNoteFilters
>({
  table: 'property_notes',
  defaultOrder: { column: 'created_at', ascending: false },
  applyFilters: (q, f) =>
    f.propertyId ? q.eq('property_id', f.propertyId) : q,
});
