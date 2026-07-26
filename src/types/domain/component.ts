import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';

/**
 * Domain schema for a Component (HVAC unit, heat pump, ventilation, etc.).
 *
 * Mirrors the `components` table in the auto-generated Supabase types.
 * Enums (`status`, `type`) are referenced from the DB-generated types so
 * they stay in sync when migrations land.
 */

type DbComponentStatus = Database['public']['Enums']['component_status'];
type DbComponentType = Database['public']['Enums']['component_type'];

// Re-derive zod enums from DB enum values via z.custom (keeps the source of
// truth in the generated types — no manual duplication of enum members).
export const componentStatusSchema = z.custom<DbComponentStatus>(
  (val) => typeof val === 'string'
);
export const componentTypeSchema = z.custom<DbComponentType>(
  (val) => typeof val === 'string'
);

export const componentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: componentTypeSchema,
  status: componentStatusSchema,
  property_id: z.string().uuid(),
  floor_id: z.string().uuid().nullable(),
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  serial_number: z.string().nullable(),
  installation_year: z.number().nullable(),
  next_service_date: z.string().nullable(),
  notes: z.string().nullable(),
  priority: z.number().nullable(),
  supplier: z.string().nullable(),
  aff_code: z.string().nullable(),
  cost_center: z.string().nullable(),
  refrigerant_amount_kg: z.number().nullable(),
  refrigerant_code: z.string().nullable(),
  refrigerant_type: z.string().nullable(),
  registration_number: z.string().nullable(),
  room_zone: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type ComponentStatus = DbComponentStatus;
export type ComponentType = DbComponentType;
export type Component = z.infer<typeof componentSchema>;

export type ComponentWithRelations = Component & {
  floors?: { id: string; name: string; level?: number | null } | null;
  properties?: { id: string; name: string; address?: string | null } | null;
};

export type CreateComponentInput =
  Database['public']['Tables']['components']['Insert'];
export type UpdateComponentInput =
  Database['public']['Tables']['components']['Update'];

export interface ComponentListFilters {
  propertyId?: string;
  floorId?: string;
  type?: ComponentType;
  status?: ComponentStatus;
}
