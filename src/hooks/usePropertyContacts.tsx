/** Hooks for `property_contacts`. */
import { createEntityHooks } from '@/hooks/internal/createEntityHooks';
import { queryKeys } from '@/lib/queryKeys';
import { propertyContactService } from '@/services/supabase';
import type {
  PropertyContact,
  PropertyContactInsert,
  PropertyContactUpdate,
  PropertyContactFilters,
} from '@/services/supabase';

export type {
  PropertyContact,
  PropertyContactInsert,
  PropertyContactUpdate,
  PropertyContactFilters,
};

const hooks = createEntityHooks<
  PropertyContact,
  PropertyContactInsert,
  PropertyContactUpdate,
  PropertyContactFilters
>({
  service: propertyContactService,
  keys: queryKeys.propertyContacts,
  realtimeTable: 'property_contacts',
  labels: {
    createdToast: 'Kontakt sparad',
    deletedToast: 'Kontakt borttagen',
  },
});

export const usePropertyContacts = hooks.useList;
export const useCreatePropertyContact = hooks.useCreate;
export const useUpdatePropertyContact = hooks.useUpdate;
export const useDeletePropertyContact = hooks.useRemove;
