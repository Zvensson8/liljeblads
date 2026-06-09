/** Hooks for `work_order_files`. */
import { createEntityHooks } from '@/hooks/internal/createEntityHooks';
import { queryKeys } from '@/lib/queryKeys';
import { workOrderFileService } from '@/services/supabase';
import type {
  WorkOrderFile,
  WorkOrderFileInsert,
  WorkOrderFileUpdate,
  WorkOrderFileFilters,
} from '@/services/supabase';

export type {
  WorkOrderFile,
  WorkOrderFileInsert,
  WorkOrderFileUpdate,
  WorkOrderFileFilters,
};

const hooks = createEntityHooks<
  WorkOrderFile,
  WorkOrderFileInsert,
  WorkOrderFileUpdate,
  WorkOrderFileFilters
>({
  service: workOrderFileService,
  keys: queryKeys.workOrderFiles,
  realtimeTable: 'work_order_files',
  labels: {
    createdToast: 'Bilaga uppladdad',
    deletedToast: 'Bilaga borttagen',
  },
});

export const useWorkOrderFiles = hooks.useList;
export const useCreateWorkOrderFile = hooks.useCreate;
export const useUpdateWorkOrderFile = hooks.useUpdate;
export const useDeleteWorkOrderFile = hooks.useRemove;
