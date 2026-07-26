import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';

/**
 * Domain schema for a Work Order entity.
 *
 * Mirrors the `work_orders` table in the auto-generated Supabase types.
 * Use this at trust boundaries (network responses, form input) when you
 * want runtime validation. Pure TS callers can keep using the `WorkOrder`
 * alias.
 */

export const workOrderStatusSchema = z.enum([
  'not_started',
  'awaiting_quote',
  'ordered',
  'completed',
  'archived',
]);

export const workOrderPrioritySchema = z.enum(['low', 'medium', 'high']);

export const workOrderSchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  property_id: z.string().uuid(),
  component_id: z.string().uuid().nullable(),
  project_id: z.string().uuid().nullable(),
  contractor: z.string().nullable(),
  comments: z.string().nullable(),
  price: z.number().nullable(),
  due_date: z.string().nullable(),
  quarter: z.string().nullable(),
  status: workOrderStatusSchema,
  priority: workOrderPrioritySchema,
  reminder_enabled: z.boolean().nullable(),
  reminder_frequency: z.string().nullable(),
  reminder_recipient_email: z.string().nullable(),
  last_reminder_sent: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type WorkOrderStatus = z.infer<typeof workOrderStatusSchema>;
export type WorkOrderPriority = z.infer<typeof workOrderPrioritySchema>;
export type WorkOrder = z.infer<typeof workOrderSchema>;

// Convenience type for queries that join properties + components
export type WorkOrderWithRelations = WorkOrder & {
  properties?: { id: string; name: string } | null;
  components?: { id: string; name: string; type: string } | null;
};

export type CreateWorkOrderInput =
  Database['public']['Tables']['work_orders']['Insert'];
export type UpdateWorkOrderInput =
  Database['public']['Tables']['work_orders']['Update'];

export interface WorkOrderListFilters {
  showArchived?: boolean;
  propertyId?: string;
  projectId?: string;
}
