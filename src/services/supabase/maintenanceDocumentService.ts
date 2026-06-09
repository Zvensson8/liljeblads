import { createCrudService } from './createCrudService';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type MaintenanceDocument = Tables<'maintenance_history_documents'>;
export type MaintenanceDocumentInsert = TablesInsert<'maintenance_history_documents'>;
export type MaintenanceDocumentUpdate = TablesUpdate<'maintenance_history_documents'>;
export interface MaintenanceDocumentFilters {
  maintenanceHistoryId?: string;
}

export const maintenanceDocumentService = createCrudService<
  MaintenanceDocument,
  MaintenanceDocumentInsert,
  MaintenanceDocumentUpdate,
  MaintenanceDocumentFilters
>({
  table: 'maintenance_history_documents',
  defaultOrder: { column: 'created_at', ascending: false },
  applyFilters: (q, f) =>
    f.maintenanceHistoryId
      ? q.eq('maintenance_history_id', f.maintenanceHistoryId)
      : q,
});
