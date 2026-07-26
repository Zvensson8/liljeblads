import { createCrudService } from './createCrudService';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type ProjectDocument = Tables<'project_documents'>;
export type ProjectDocumentInsert = TablesInsert<'project_documents'>;
export type ProjectDocumentUpdate = TablesUpdate<'project_documents'>;
export interface ProjectDocumentFilters {
  projectId?: string;
  latestOnly?: boolean;
}

export const projectDocumentService = createCrudService<
  ProjectDocument,
  ProjectDocumentInsert,
  ProjectDocumentUpdate,
  ProjectDocumentFilters
>({
  table: 'project_documents',
  defaultOrder: { column: 'created_at', ascending: false },
  applyFilters: (q, f) => {
    let r = q;
    if (f.projectId) r = r.eq('project_id', f.projectId);
    if (f.latestOnly) r = r.eq('is_latest', true);
    return r;
  },
});
