import { createCrudService } from './createCrudService';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type PropertyDocument = Tables<'property_documents'>;
export type PropertyDocumentInsert = TablesInsert<'property_documents'>;
export type PropertyDocumentUpdate = TablesUpdate<'property_documents'>;
export interface PropertyDocumentFilters {
  propertyId?: string;
  latestOnly?: boolean;
}

export const propertyDocumentService = createCrudService<
  PropertyDocument,
  PropertyDocumentInsert,
  PropertyDocumentUpdate,
  PropertyDocumentFilters
>({
  table: 'property_documents',
  defaultOrder: { column: 'created_at', ascending: false },
  applyFilters: (q, f) => {
    let r = q;
    if (f.propertyId) r = r.eq('property_id', f.propertyId);
    if (f.latestOnly) r = r.eq('is_latest', true);
    return r;
  },
});
