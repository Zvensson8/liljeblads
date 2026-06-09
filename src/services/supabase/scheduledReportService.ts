import { createCrudService } from './createCrudService';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type ScheduledReport = Tables<'scheduled_reports'>;
export type ScheduledReportInsert = TablesInsert<'scheduled_reports'>;
export type ScheduledReportUpdate = TablesUpdate<'scheduled_reports'>;
export interface ScheduledReportFilters {
  organizationId?: string;
  isActive?: boolean;
}

export const scheduledReportService = createCrudService<
  ScheduledReport,
  ScheduledReportInsert,
  ScheduledReportUpdate,
  ScheduledReportFilters
>({
  table: 'scheduled_reports',
  defaultOrder: { column: 'created_at', ascending: false },
  applyFilters: (q, f) => {
    let r = q;
    if (f.organizationId) r = r.eq('organization_id', f.organizationId);
    if (f.isActive !== undefined) r = r.eq('is_active', f.isActive);
    return r;
  },
});
