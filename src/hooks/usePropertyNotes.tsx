/** Hooks for `property_notes`. */
import { createEntityHooks } from '@/hooks/internal/createEntityHooks';
import { queryKeys } from '@/lib/queryKeys';
import { propertyNoteService } from '@/services/supabase';
import type {
  PropertyNote,
  PropertyNoteInsert,
  PropertyNoteUpdate,
  PropertyNoteFilters,
} from '@/services/supabase';

export type {
  PropertyNote,
  PropertyNoteInsert,
  PropertyNoteUpdate,
  PropertyNoteFilters,
};

const hooks = createEntityHooks<
  PropertyNote,
  PropertyNoteInsert,
  PropertyNoteUpdate,
  PropertyNoteFilters
>({
  service: propertyNoteService,
  keys: queryKeys.propertyNotes,
  realtimeTable: 'property_notes',
  labels: {
    createdToast: 'Anteckning sparad',
    deletedToast: 'Anteckning borttagen',
  },
});

export const usePropertyNotes = hooks.useList;
export const useCreatePropertyNote = hooks.useCreate;
export const useUpdatePropertyNote = hooks.useUpdate;
export const useDeletePropertyNote = hooks.useRemove;
