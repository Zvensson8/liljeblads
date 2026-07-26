import type { Database } from '@/integrations/supabase/types';

/**
 * Profile entity, derived from the auto-generated `profiles` table type.
 */
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type UpdateProfileInput =
  Database['public']['Tables']['profiles']['Update'];

export type AppRole = Database['public']['Enums']['app_role'];

export interface PropertySummary {
  id: string;
  name: string;
  address?: string | null;
}
