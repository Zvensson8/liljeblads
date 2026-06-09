import { createCrudService } from './createCrudService';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type UserConsent = Tables<'user_consents'>;
export type UserConsentInsert = TablesInsert<'user_consents'>;
export type UserConsentUpdate = TablesUpdate<'user_consents'>;
export interface UserConsentFilters {
  userId?: string;
  consentType?: string;
}

export const userConsentService = createCrudService<
  UserConsent,
  UserConsentInsert,
  UserConsentUpdate,
  UserConsentFilters
>({
  table: 'user_consents',
  defaultOrder: { column: 'created_at', ascending: false },
  applyFilters: (q, f) => {
    let r = q;
    if (f.userId) r = r.eq('user_id', f.userId);
    if (f.consentType) r = r.eq('consent_type', f.consentType);
    return r;
  },
});
