/** Hooks for `property_documents`. */
import { createEntityHooks } from '@/hooks/internal/createEntityHooks';
import { queryKeys } from '@/lib/queryKeys';
import { propertyDocumentService } from '@/services/supabase';
import type {
  PropertyDocument,
  PropertyDocumentInsert,
  PropertyDocumentUpdate,
  PropertyDocumentFilters,
} from '@/services/supabase';

export type {
  PropertyDocument,
  PropertyDocumentInsert,
  PropertyDocumentUpdate,
  PropertyDocumentFilters,
};

const hooks = createEntityHooks<
  PropertyDocument,
  PropertyDocumentInsert,
  PropertyDocumentUpdate,
  PropertyDocumentFilters
>({
  service: propertyDocumentService,
  keys: queryKeys.propertyDocuments,
  realtimeTable: 'property_documents',
  labels: {
    createdToast: 'Dokument uppladdat',
    deletedToast: 'Dokument borttaget',
  },
});

export const usePropertyDocuments = hooks.useList;
export const useCreatePropertyDocument = hooks.useCreate;
export const useUpdatePropertyDocument = hooks.useUpdate;
export const useDeletePropertyDocument = hooks.useRemove;
