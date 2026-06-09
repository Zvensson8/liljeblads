/**
 * Work order service — wraps the `work_orders` table with relation joins
 * and status filtering. Work orders join exclusively on `property_id`
 * (see project memory).
 */
import { createCrudService } from './createCrudService';
import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrderListFilters,
  WorkOrderWithRelations,
} from '@/types/domain/workOrder';

const ACTIVE_STATUSES = ['not_started', 'awaiting_quote', 'ordered'] as const;
const ARCHIVED_STATUSES = ['completed', 'archived'] as const;

export const workOrderService = createCrudService<
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
