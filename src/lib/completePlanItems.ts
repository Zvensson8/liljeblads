import { supabase } from '@/integrations/supabase/client';

/** Mark plan rows on a project as done and tell EnergyPulse when the source is EP. */
export async function completePlanItemsForProject(projectId: string): Promise<number> {
  const { data: items, error } = await supabase
    .from('maintenance_plan_items')
    .select(
      'id, source, external_id, title, notes, year, quarter, estimated_cost, plan_id, maintenance_plans(property_id)',
    )
    .eq('project_id', projectId)
    .in('status', ['promoted', 'planned']);
  if (error) throw error;
  if (!items?.length) return 0;

  const { error: updErr } = await supabase
    .from('maintenance_plan_items')
    .update({ status: 'done' })
    .eq('project_id', projectId)
    .in('status', ['promoted', 'planned']);
  if (updErr) throw updErr;

  const { notifyEnergyPulsePlanItemCompleted } = await import(
    '@/lib/notifyEnergyPulse'
  );
  for (const item of items) {
    if (item.source !== 'energypulse' || !item.external_id) continue;
    const plan = item.maintenance_plans as { property_id?: string } | { property_id?: string }[] | null;
    const propertyId = Array.isArray(plan) ? plan[0]?.property_id : plan?.property_id;
    if (!propertyId) continue;
    try {
      await notifyEnergyPulsePlanItemCompleted({
        propertyId,
        planItemId: item.id,
        actionId: item.external_id,
      });
    } catch (e) {
      console.warn('[completePlanItems] EP notify failed', e);
    }
  }
  return items.length;
}

export async function completePlanItemsIfProjectWorkDone(projectId: string): Promise<void> {
  const { count, error } = await supabase
    .from('work_orders')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .neq('status', 'completed');
  if (error) throw error;
  if ((count ?? 0) > 0) return;
  await completePlanItemsForProject(projectId);
}
