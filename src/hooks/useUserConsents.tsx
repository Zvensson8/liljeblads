/** Hooks for `user_consents`. */
import { createEntityHooks } from '@/hooks/internal/createEntityHooks';
import { queryKeys } from '@/lib/queryKeys';
import { userConsentService } from '@/services/supabase';
import type {
  UserConsent,
  UserConsentInsert,
  UserConsentUpdate,
  UserConsentFilters,
} from '@/services/supabase';

export type {
  UserConsent,
  UserConsentInsert,
  UserConsentUpdate,
  UserConsentFilters,
};

const hooks = createEntityHooks<
  UserConsent,
  UserConsentInsert,
  UserConsentUpdate,
  UserConsentFilters
>({
  service: userConsentService,
  keys: queryKeys.userConsents,
  realtimeTable: 'user_consents',
  labels: {
    createdToast: 'Samtycke uppdaterat',
    updatedToast: undefined,
    createErrorTitle: 'Kunde inte uppdatera samtycke',
    updateErrorTitle: 'Kunde inte uppdatera samtycke',
  },
});

export const useUserConsents = hooks.useList;
export const useCreateUserConsent = hooks.useCreate;
export const useUpdateUserConsent = hooks.useUpdate;
export const useDeleteUserConsent = hooks.useRemove;
