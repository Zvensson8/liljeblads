/** Hooks for `scheduled_reports`. */
import { createEntityHooks } from '@/hooks/internal/createEntityHooks';
import { queryKeys } from '@/lib/queryKeys';
import { scheduledReportService } from '@/services/supabase';
import type {
  ScheduledReport,
  ScheduledReportInsert,
  ScheduledReportUpdate,
  ScheduledReportFilters,
} from '@/services/supabase';

export type {
  ScheduledReport,
  ScheduledReportInsert,
  ScheduledReportUpdate,
  ScheduledReportFilters,
};

const hooks = createEntityHooks<
  ScheduledReport,
  ScheduledReportInsert,
  ScheduledReportUpdate,
  ScheduledReportFilters
>({
  service: scheduledReportService,
  keys: queryKeys.scheduledReports,
  realtimeTable: 'scheduled_reports',
  labels: {
    createdToast: 'Schemalagd rapport skapad',
    deletedToast: 'Schemalagd rapport borttagen',
    createErrorTitle: 'Kunde inte skapa rapport',
    updateErrorTitle: 'Kunde inte uppdatera rapport',
    deleteErrorTitle: 'Kunde inte ta bort rapport',
  },
});

export const useScheduledReports = hooks.useList;
export const useScheduledReport = hooks.useGetById;
export const useCreateScheduledReport = hooks.useCreate;
export const useUpdateScheduledReport = hooks.useUpdate;
export const useDeleteScheduledReport = hooks.useRemove;
