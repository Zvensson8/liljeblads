/** Hooks for `project_documents`. */
import { createEntityHooks } from '@/hooks/internal/createEntityHooks';
import { queryKeys } from '@/lib/queryKeys';
import { projectDocumentService } from '@/services/supabase';
import type {
  ProjectDocument,
  ProjectDocumentInsert,
  ProjectDocumentUpdate,
  ProjectDocumentFilters,
} from '@/services/supabase';

export type {
  ProjectDocument,
  ProjectDocumentInsert,
  ProjectDocumentUpdate,
  ProjectDocumentFilters,
};

const hooks = createEntityHooks<
  ProjectDocument,
  ProjectDocumentInsert,
  ProjectDocumentUpdate,
  ProjectDocumentFilters
>({
  service: projectDocumentService,
  keys: queryKeys.projectDocuments,
  realtimeTable: 'project_documents',
  labels: {
    createdToast: 'Dokument uppladdat',
    deletedToast: 'Dokument borttaget',
  },
});

export const useProjectDocuments = hooks.useList;
export const useCreateProjectDocument = hooks.useCreate;
export const useUpdateProjectDocument = hooks.useUpdate;
export const useDeleteProjectDocument = hooks.useRemove;
