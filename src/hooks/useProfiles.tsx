/** Hooks for `profiles`. */
import { createEntityHooks } from '@/hooks/internal/createEntityHooks';
import { queryKeys } from '@/lib/queryKeys';
import { profileService } from '@/services/supabase';
import type {
  Profile,
  ProfileInsert,
  ProfileUpdate,
  ProfileFilters,
} from '@/services/supabase';

export type { Profile, ProfileInsert, ProfileUpdate, ProfileFilters };

const hooks = createEntityHooks<
  Profile,
  ProfileInsert,
  ProfileUpdate,
  ProfileFilters
>({
  service: profileService,
  keys: queryKeys.profiles,
  realtimeTable: 'profiles',
  labels: {
    createErrorTitle: 'Kunde inte skapa profil',
    updateErrorTitle: 'Kunde inte uppdatera profil',
    deleteErrorTitle: 'Kunde inte ta bort profil',
  },
});

export const useProfiles = hooks.useList;
export const useProfile = hooks.useGetById;
export const useUpdateProfile = hooks.useUpdate;
export const useDeleteProfile = hooks.useRemove;
