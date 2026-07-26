/**
 * Dashboard stats service — thin wrapper over the
 * `get_dashboard_stats` RPC. Returned payload is validated with the Zod
 * schema in the domain layer.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  dashboardStatsSchema,
  type DashboardStats,
} from '@/types/domain/dashboardStats';

export const dashboardStatsService = {
  async get(propertyIds: string[]): Promise<DashboardStats> {
    const { data, error } = await supabase.rpc('get_dashboard_stats', {
      property_ids: propertyIds,
    });
    if (error) throw error;
    return dashboardStatsSchema.parse(data ?? {});
  },
};
