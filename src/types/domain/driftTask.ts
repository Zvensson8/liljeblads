import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';

/**
 * Domain schema for a DriftTask — operational/maintenance task scheduled
 * for a property in a given year + quarter.
 *
 * Mirrors `drift_tasks`. The `quarter` field is a DB enum (`Q1`–`Q4`,
 * `YEAR`) referenced from generated types.
 */

type DbQuarter = Database['public']['Enums']['quarter_type'];

export const quarterSchema = z.custom<DbQuarter>(
  (val) => typeof val === 'string'
);

export const driftTaskSchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  year: z.number().int(),
  quarter: quarterSchema,
  category_id: z.string().uuid().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  planned_count: z.number().int(),
  reported_count: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type Quarter = DbQuarter;
export type DriftTask = z.infer<typeof driftTaskSchema>;

export type DriftTaskWithRelations = DriftTask & {
  drift_categories?: { id: string; name: string } | null;
  properties?: { id: string; name: string } | null;
};

export type CreateDriftTaskInput =
  Database['public']['Tables']['drift_tasks']['Insert'];
export type UpdateDriftTaskInput =
  Database['public']['Tables']['drift_tasks']['Update'];

export interface DriftTaskListFilters {
  propertyId?: string;
  year?: number;
  quarter?: Quarter;
  categoryId?: string;
}
