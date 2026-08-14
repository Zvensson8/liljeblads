import { z } from 'zod';

/**
 * Domain schema for a Property entity.
 *
 * Source of truth = the auto-generated Supabase types in
 * `src/integrations/supabase/types.ts`. This schema mirrors the same shape
 * but adds:
 *   - runtime validation via Zod (optional, used at trust boundaries)
 *   - a few enriched fields populated by the data layer (energy_grade)
 *
 * Keep field names in sync with the `properties` table columns.
 */
export const propertySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  address: z.string().nullable(),
  description: z.string().nullable(),
  area_sqm: z.number().nullable(),
  construction_year: z.number().nullable(),
  property_type: z.string().nullable(),
  loa: z.string().nullable(),
  property_number: z.string().nullable(),
  invoice_address: z.string().nullable(),
  energy_grade: z.string().nullable().optional(),
});

export type Property = z.infer<typeof propertySchema>;

export const createPropertyInputSchema = z.object({
  name: z.string().min(1, 'Namn krävs').max(200),
  address: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  property_number: z.string().max(50).optional().nullable(),
  area_sqm: z.number().optional().nullable(),
  construction_year: z.number().optional().nullable(),
  property_type: z.string().max(100).optional().nullable(),
  loa: z.string().max(100).optional().nullable(),
  invoice_address: z.string().max(500).optional().nullable(),
});

export type CreatePropertyInput = z.infer<typeof createPropertyInputSchema>;
