/** Hooks for `ai_suggested_actions` (project proposals + AI tool-calling). */
import { createEntityHooks } from '@/hooks/internal/createEntityHooks';
import { queryKeys } from '@/lib/queryKeys';
import { aiSuggestedActionService } from '@/services/supabase';
import type {
  AISuggestedAction,
  AISuggestedActionInsert,
  AISuggestedActionUpdate,
  AISuggestedActionFilters,
} from '@/services/supabase';

export type {
  AISuggestedAction,
  AISuggestedActionInsert,
  AISuggestedActionUpdate,
  AISuggestedActionFilters,
};

const hooks = createEntityHooks<
  AISuggestedAction,
  AISuggestedActionInsert,
  AISuggestedActionUpdate,
  AISuggestedActionFilters
>({
  service: aiSuggestedActionService,
  keys: queryKeys.aiSuggestedActions,
  realtimeTable: 'ai_suggested_actions',
  labels: {
    createdToast: 'Förslag skapat',
    deletedToast: 'Förslag borttaget',
    createErrorTitle: 'Kunde inte skapa förslag',
    updateErrorTitle: 'Kunde inte uppdatera förslag',
    deleteErrorTitle: 'Kunde inte ta bort förslag',
  },
});

export const useAISuggestedActions = hooks.useList;
export const useAISuggestedAction = hooks.useGetById;
export const useCreateAISuggestedAction = hooks.useCreate;
export const useUpdateAISuggestedAction = hooks.useUpdate;
export const useDeleteAISuggestedAction = hooks.useRemove;
