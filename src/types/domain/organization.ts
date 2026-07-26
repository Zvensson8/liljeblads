import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';

/**
 * Domain schema for an Organization. Auto-generated `Tables<'organizations'>`
 * stays the source of truth; this file adds zod validation for trust
 * boundaries and convenience aliases for inserts/updates.
 */

export type Organization = Database['public']['Tables']['organizations']['Row'];
export type CreateOrganizationInput =
  Database['public']['Tables']['organizations']['Insert'];
export type UpdateOrganizationInput =
  Database['public']['Tables']['organizations']['Update'];

export type OrganizationMember =
  Database['public']['Tables']['organization_members']['Row'];
export type OrganizationInvitation =
  Database['public']['Tables']['organization_invitations']['Row'];

export const organizationRoleSchema = z.enum([
  'owner',
  'admin',
  'member',
  'viewer',
]);
export type OrganizationRole = z.infer<typeof organizationRoleSchema>;

export interface OrganizationListFilters {
  active?: boolean;
}
