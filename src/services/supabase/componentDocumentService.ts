import { createCrudService } from './createCrudService';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type ComponentDocument = Tables<'component_documents'>;
export type ComponentDocumentInsert = TablesInsert<'component_documents'>;
export type ComponentDocumentUpdate = TablesUpdate<'component_documents'>;
export interface ComponentDocumentFilters {
  componentId?: string;
  latestOnly?: boolean;
}

export const componentDocumentService = createCrudService<
  ComponentDocument,
  ComponentDocumentInsert,
  ComponentDocumentUpdate,
  ComponentDocumentFilters
>({
  table: 'component_documents',
  defaultOrder: { column: 'created_at', ascending: false },
  applyFilters: (q, f) => {
    let r = q;
    if (f.componentId) r = r.eq('component_id', f.componentId);
    if (f.latestOnly) r = r.eq('is_latest', true);
    return r;
  },
});
