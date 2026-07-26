import { createCrudService } from './createCrudService';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type Profile = Tables<'profiles'>;
export type ProfileInsert = TablesInsert<'profiles'>;
export type ProfileUpdate = TablesUpdate<'profiles'>;
export interface ProfileFilters {
  organizationId?: string;
  approved?: boolean;
}

export const profileService = createCrudService<
  Profile,
  ProfileInsert,
  ProfileUpdate,
  ProfileFilters
>({
  table: 'profiles',
  defaultOrder: { column: 'full_name', ascending: true, nullsFirst: false },
  applyFilters: (q, f) => {
    let r = q;
    if (f.organizationId) r = r.eq('organization_id', f.organizationId);
    if (f.approved !== undefined) r = r.eq('approved', f.approved);
    return r;
  },
});
