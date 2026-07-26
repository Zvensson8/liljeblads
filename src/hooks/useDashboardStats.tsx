import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';
import { dashboardStatsService } from '@/services/supabase';
import type {
  DashboardStats,
  DashboardStatsFilters,
} from '@/types/domain/dashboardStats';

export type { DashboardStats, DashboardStatsFilters } from '@/types/domain/dashboardStats';

/**
 * Hook: fetch aggregated dashboard statistics for the supplied properties.
 *
 * Wraps the `get_dashboard_stats` RPC. Disabled when no properties are
 * passed so we don't fire an unnecessary request on first paint.
 */
export function useDashboardStats(filters: DashboardStatsFilters) {
  const { session } = useAuth();
  const sortedIds = [...filters.propertyIds].sort();

  return useQuery<DashboardStats>({
    queryKey: queryKeys.dashboardStats.list({ propertyIds: sortedIds }),
    queryFn: () => dashboardStatsService.get(sortedIds),
    enabled: !!session && sortedIds.length > 0,
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 30,
  });
}
