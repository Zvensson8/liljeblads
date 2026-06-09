import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';
import {
  dashboardStatsSchema,
  type DashboardStats,
  type DashboardStatsFilters,
} from '@/types/domain/dashboardStats';

export type { DashboardStats, DashboardStatsFilters } from '@/types/domain/dashboardStats';

async function fetchDashboardStats(
  filters: DashboardStatsFilters
): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('get_dashboard_stats', {
    property_ids: filters.propertyIds,
  });
  if (error) throw error;
  // RPC returns JSON; coerce with schema defaults so missing keys stay safe.
  return dashboardStatsSchema.parse(data ?? {});
}

/**
 * Hook: fetch aggregated dashboard statistics for the supplied properties.
 *
 * Wraps the `get_dashboard_stats` RPC. Disabled when no properties are
 * passed so we don't fire an unnecessary request on first paint.
 */
export function useDashboardStats(filters: DashboardStatsFilters) {
  const { session } = useAuth();

  return useQuery({
    queryKey: queryKeys.dashboardStats.list({
      propertyIds: [...filters.propertyIds].sort(),
    }),
    queryFn: () => fetchDashboardStats(filters),
    enabled: !!session && filters.propertyIds.length > 0,
    staleTime: 1000 * 60, // 1 min — dashboard is read-often
    gcTime: 1000 * 60 * 30,
  });
}
