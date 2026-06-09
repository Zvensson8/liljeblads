import { z } from 'zod';

/**
 * Domain schema for dashboard statistics returned by the
 * `get_dashboard_stats` RPC.
 *
 * Mirrors the JSON returned by the SECURITY DEFINER function on the DB.
 * Nested arrays (recent_*) are kept loose (`unknown`) since each consumer
 * already declares its own row type.
 */

export const dashboardStatsSchema = z.object({
  total_work_orders: z.number().default(0),
  total_projects: z.number().default(0),
  total_todos: z.number().default(0),
  pending_todos: z.number().default(0),
  pending_work_orders: z.number().default(0),
  active_projects: z.number().default(0),
  completed_todos: z.number().default(0),
  recent_work_orders: z.array(z.unknown()).default([]),
  recent_projects: z.array(z.unknown()).default([]),
  recent_todos: z.array(z.unknown()).default([]),
});

export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

export interface DashboardStatsFilters {
  propertyIds: string[];
}
