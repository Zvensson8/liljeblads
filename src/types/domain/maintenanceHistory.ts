import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';

/**
 * Domain schema for a MaintenanceHistory record (a single service /
 * action performed on a component).
 *
 * Mirrors the `maintenance_history` table in the auto-generated Supabase
 * types. The `category` field is constrained by a DB CHECK constraint
 * to one of the values below.
 */

export const maintenanceCategorySchema = z.enum([
  'planned',
  'preventive',
  'acute',
  'warranty',
]);

export type MaintenanceCategory = z.infer<typeof maintenanceCategorySchema>;

export const maintenanceHistorySchema = z.object({
  id: z.string().uuid(),
  component_id: z.string().uuid(),
  action_type: z.string(),
  performed_date: z.string(),
  supplier: z.string().nullable(),
  cost: z.number().nullable(),
  notes: z.string().nullable(),
  category: maintenanceCategorySchema.nullable(),
  is_warranty: z.boolean().nullable(),
  expected_cost: z.number().nullable(),
  drift_task_id: z.string().uuid().nullable(),
  work_order_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type MaintenanceHistory = z.infer<typeof maintenanceHistorySchema>;

export type CreateMaintenanceHistoryInput =
  Database['public']['Tables']['maintenance_history']['Insert'];
export type UpdateMaintenanceHistoryInput =
  Database['public']['Tables']['maintenance_history']['Update'];

export interface MaintenanceHistoryListFilters {
  componentId?: string;
  category?: MaintenanceCategory;
  fromDate?: string;
  toDate?: string;
}
