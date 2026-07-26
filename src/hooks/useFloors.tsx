/**
 * Hooks for `floors` table. Floor IDs are independent from components
 * (see project memory): floors live under a property and components can
 * exist without one.
 */
import { createEntityHooks } from '@/hooks/internal/createEntityHooks';
import { queryKeys } from '@/lib/queryKeys';
import { floorService } from '@/services/supabase';
import type { Floor, FloorInsert, FloorUpdate, FloorListFilters } from '@/services/supabase';

export type { Floor, FloorInsert, FloorUpdate, FloorListFilters };

const hooks = createEntityHooks<Floor, FloorInsert, FloorUpdate, FloorListFilters>({
  service: floorService,
  keys: queryKeys.floors,
  realtimeTable: 'floors',
  labels: {
    createdToast: 'Våning skapad',
    deletedToast: 'Våning borttagen',
    createErrorTitle: 'Kunde inte skapa våning',
    updateErrorTitle: 'Kunde inte uppdatera våning',
    deleteErrorTitle: 'Kunde inte ta bort våning',
  },
});

export const useFloors = hooks.useList;
export const useFloor = hooks.useGetById;
export const useCreateFloor = hooks.useCreate;
export const useUpdateFloor = hooks.useUpdate;
export const useDeleteFloor = hooks.useRemove;
