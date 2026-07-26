/**
 * Hooks for `drift_categories` table.
 */
import { createEntityHooks } from '@/hooks/internal/createEntityHooks';
import { queryKeys } from '@/lib/queryKeys';
import { driftCategoryService } from '@/services/supabase';
import type {
  DriftCategory,
  DriftCategoryInsert,
  DriftCategoryUpdate,
  DriftCategoryFilters,
} from '@/services/supabase';

export type { DriftCategory, DriftCategoryInsert, DriftCategoryUpdate, DriftCategoryFilters };

const hooks = createEntityHooks<
  DriftCategory,
  DriftCategoryInsert,
  DriftCategoryUpdate,
  DriftCategoryFilters
>({
  service: driftCategoryService,
  keys: queryKeys.driftCategories,
  realtimeTable: 'drift_categories',
  labels: {
    createdToast: 'Kategori skapad',
    deletedToast: 'Kategori borttagen',
    createErrorTitle: 'Kunde inte skapa kategori',
    updateErrorTitle: 'Kunde inte uppdatera kategori',
    deleteErrorTitle: 'Kunde inte ta bort kategori',
  },
});

export const useDriftCategories = hooks.useList;
export const useDriftCategory = hooks.useGetById;
export const useCreateDriftCategory = hooks.useCreate;
export const useUpdateDriftCategory = hooks.useUpdate;
export const useDeleteDriftCategory = hooks.useRemove;
