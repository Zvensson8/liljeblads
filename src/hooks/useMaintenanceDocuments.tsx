/** Hooks for `maintenance_history_documents`. */
import { createEntityHooks } from '@/hooks/internal/createEntityHooks';
import { queryKeys } from '@/lib/queryKeys';
import { maintenanceDocumentService } from '@/services/supabase';
import type {
  MaintenanceDocument,
  MaintenanceDocumentInsert,
  MaintenanceDocumentUpdate,
  MaintenanceDocumentFilters,
} from '@/services/supabase';

export type {
  MaintenanceDocument,
  MaintenanceDocumentInsert,
  MaintenanceDocumentUpdate,
  MaintenanceDocumentFilters,
};

const hooks = createEntityHooks<
  MaintenanceDocument,
  MaintenanceDocumentInsert,
  MaintenanceDocumentUpdate,
  MaintenanceDocumentFilters
>({
  service: maintenanceDocumentService,
  keys: queryKeys.maintenanceDocuments,
  realtimeTable: 'maintenance_history_documents',
  labels: {
    createdToast: 'Bilaga uppladdad',
    deletedToast: 'Bilaga borttagen',
  },
});

export const useMaintenanceDocuments = hooks.useList;
export const useCreateMaintenanceDocument = hooks.useCreate;
export const useUpdateMaintenanceDocument = hooks.useUpdate;
export const useDeleteMaintenanceDocument = hooks.useRemove;
