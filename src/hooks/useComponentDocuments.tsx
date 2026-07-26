/** Hooks for `component_documents`. */
import { createEntityHooks } from '@/hooks/internal/createEntityHooks';
import { queryKeys } from '@/lib/queryKeys';
import { componentDocumentService } from '@/services/supabase';
import type {
  ComponentDocument,
  ComponentDocumentInsert,
  ComponentDocumentUpdate,
  ComponentDocumentFilters,
} from '@/services/supabase';

export type {
  ComponentDocument,
  ComponentDocumentInsert,
  ComponentDocumentUpdate,
  ComponentDocumentFilters,
};

const hooks = createEntityHooks<
  ComponentDocument,
  ComponentDocumentInsert,
  ComponentDocumentUpdate,
  ComponentDocumentFilters
>({
  service: componentDocumentService,
  keys: queryKeys.componentDocuments,
  realtimeTable: 'component_documents',
  labels: {
    createdToast: 'Dokument uppladdat',
    deletedToast: 'Dokument borttaget',
  },
});

export const useComponentDocuments = hooks.useList;
export const useCreateComponentDocument = hooks.useCreate;
export const useUpdateComponentDocument = hooks.useUpdate;
export const useDeleteComponentDocument = hooks.useRemove;
