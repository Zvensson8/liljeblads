/**
 * Work order service — wraps the `work_orders` table with relation joins
 * and status filtering. Work orders join exclusively on `property_id`
 * (see project memory).
 */
import { supabase } from '@/integrations/supabase/client';
import { createCrudService } from './createCrudService';
import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrderListFilters,
  WorkOrderWithRelations,
} from '@/types/domain/workOrder';

const ACTIVE_STATUSES = ['not_started', 'awaiting_quote', 'ordered'] as const;
const ARCHIVED_STATUSES = ['completed', 'archived'] as const;

const base = createCrudService<
  WorkOrderWithRelations,
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrderListFilters
>({
  table: 'work_orders',
  select: `
    *,
    properties (id, name),
    components (id, name, type)
  `,
  defaultOrder: { column: 'created_at', ascending: false },
  applyFilters: (query, filters) => {
    const statuses = filters.showArchived ? ARCHIVED_STATUSES : ACTIVE_STATUSES;
    let q = query.in('status', [...statuses]);
    if (filters.propertyId) q = q.eq('property_id', filters.propertyId);
    if (filters.projectId) q = q.eq('project_id', filters.projectId);
    return q;
  },
});

async function listForOrganization(
  filters: WorkOrderListFilters = {},
): Promise<WorkOrderWithRelations[]> {
  const statuses = filters.showArchived ? ARCHIVED_STATUSES : ACTIVE_STATUSES;
  const useInner = !!filters.organizationId;
  let query = (supabase as any)
    .from('work_orders')
    .select(
      useInner
        ? `*, properties!inner (id, name, organization_id), components (id, name, type)`
        : `*, properties (id, name), components (id, name, type)`,
    )
    .in('status', [...statuses])
    .order('created_at', { ascending: false });

  if (filters.propertyId) query = query.eq('property_id', filters.propertyId);
  if (filters.projectId) query = query.eq('project_id', filters.projectId);
  if (filters.organizationId) {
    query = query.eq('properties.organization_id', filters.organizationId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as WorkOrderWithRelations[];
}

export const workOrderService = {
  ...base,
  list: listForOrganization,
};
