import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

const PROJECT_TOOLS = new Set([
  'apply_update_project',
  'apply_create_project',
  'apply_project_status',
  'apply_add_budget_item',
  'apply_add_project_cost',
  'apply_complete_checklist_item',
]);

const WORK_ORDER_TOOLS = new Set([
  'apply_create_work_order',
  'apply_work_order_status',
]);

const TODO_TOOLS = new Set([
  'apply_create_todo',
  'apply_complete_todo',
]);

const PROPERTY_TOOLS = new Set([
  'apply_update_property',
  'apply_create_property',
  'apply_update_invoice_address',
  'apply_property_note',
]);

function collectTools(
  actions: Array<{ tool?: string; success?: boolean; results?: unknown[] }>,
): Set<string> {
  const tools = new Set<string>();
  for (const a of actions) {
    if (a.success === false) continue;
    if (a.tool) tools.add(a.tool);
    if (Array.isArray(a.results)) {
      for (const r of a.results) {
        if (r && typeof r === 'object' && 'tool' in r) {
          const t = (r as { tool?: string; success?: boolean }).tool;
          if (t && (r as { success?: boolean }).success !== false) tools.add(t);
        }
      }
    }
  }
  return tools;
}

/** Refresh lists after Jarvis writes (edge functions bypass the React Query cache). */
export function invalidateAfterJarvisApplies(
  queryClient: QueryClient,
  actions: Array<{ tool?: string; success?: boolean; results?: unknown[] }>,
): void {
  if (!actions.length) return;
  const tools = collectTools(actions);
  const hit = (set: Set<string>) => [...tools].some((t) => set.has(t));

  if (hit(PROJECT_TOOLS)) {
    queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
  }
  if (hit(WORK_ORDER_TOOLS)) {
    queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.all });
  }
  if (hit(TODO_TOOLS)) {
    queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
  }
  if (hit(PROPERTY_TOOLS)) {
    queryClient.invalidateQueries({ queryKey: queryKeys.properties.all });
  }
  queryClient.invalidateQueries({ queryKey: ['jarvis-action-log'] });
}
