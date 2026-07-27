/**
 * Feedback loop when a work order is completed:
 * 1. Close related pending Weibull risk suggestions for the component
 * 2. Recompute risk (history now includes the completed WO service row)
 * 3. Store a risk snapshot for history / trends
 */

import { supabase } from '@/integrations/supabase/client';
import {
  computeComponentRisk,
  type ComponentRiskResult,
} from '@/lib/componentRisk';

export interface RiskFeedbackResult {
  closedSuggestions: number;
  snapshotId: string | null;
  riskAfter: ComponentRiskResult | null;
}

/**
 * Run after WO status → completed and maintenance_history is written.
 */
export async function applyWorkOrderRiskFeedback(params: {
  workOrderId: string;
  componentId: string;
  organizationId?: string | null;
}): Promise<RiskFeedbackResult> {
  const { workOrderId, componentId } = params;
  let closedSuggestions = 0;
  let snapshotId: string | null = null;
  let riskAfter: ComponentRiskResult | null = null;

  // Resolve organization via property if not provided
  let orgId = params.organizationId ?? null;
  if (!orgId) {
    const { data: comp } = await supabase
      .from('components')
      .select('property_id, properties(organization_id)')
      .eq('id', componentId)
      .maybeSingle();
    const props = comp?.properties as { organization_id?: string } | null;
    orgId = props?.organization_id ?? null;
  }

  // 1) Close pending/approved weibull suggestions for this component
  try {
    const since = new Date();
    since.setDate(since.getDate() - 90);

    let q = supabase
      .from('ai_suggested_actions')
      .select('id, payload, status')
      .eq('action_type', 'create_work_order')
      .in('status', ['pending', 'approved'])
      .gte('created_at', since.toISOString());

    if (orgId) {
      q = q.eq('organization_id', orgId);
    }

    const { data: actions } = await q;
    const toClose = (actions ?? []).filter((a) => {
      const p = a.payload as { component_id?: string; source?: string } | null;
      return p?.component_id === componentId && p?.source === 'weibull_risk';
    });

    for (const a of toClose) {
      const { error } = await supabase
        .from('ai_suggested_actions')
        .update({
          status: 'executed',
          executed_at: new Date().toISOString(),
          execution_result: {
            closed_by: 'wo_completed',
            work_order_id: workOrderId,
            note: 'Riskförslag stängt automatiskt när relaterad arbetsorder slutfördes',
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', a.id);
      if (!error) closedSuggestions += 1;
    }
  } catch (e) {
    console.warn('[riskFeedback] close suggestions failed', e);
  }

  // 2) Recompute risk after service history includes this WO
  try {
    const [compRes, purchaseRes, histRes] = await Promise.all([
      supabase
        .from('components')
        .select('id, name, type, installation_year, property_id, properties(name, organization_id)')
        .eq('id', componentId)
        .single(),
      supabase
        .from('component_purchase_info')
        .select('expected_lifespan_years, purchase_date')
        .eq('component_id', componentId)
        .maybeSingle(),
      supabase
        .from('maintenance_history')
        .select('performed_date, category')
        .eq('component_id', componentId)
        .order('performed_date', { ascending: true }),
    ]);

    if (!compRes.error && compRes.data) {
      const prop = compRes.data.properties as {
        name?: string;
        organization_id?: string;
      } | null;
      riskAfter = computeComponentRisk({
        componentId,
        name: compRes.data.name,
        type: compRes.data.type,
        propertyId: compRes.data.property_id,
        propertyName: prop?.name ?? null,
        installationYear: compRes.data.installation_year,
        purchaseDate: purchaseRes.data?.purchase_date ?? null,
        expectedLifespanYears:
          purchaseRes.data?.expected_lifespan_years ?? null,
        history: (histRes.data ?? []).map((h) => ({
          performed_date: h.performed_date,
          category: h.category,
        })),
      });
      riskAfter = {
        ...riskAfter,
        name: compRes.data.name,
        type: compRes.data.type,
        propertyId: compRes.data.property_id,
        propertyName: prop?.name ?? null,
      };
      if (!orgId) orgId = prop?.organization_id ?? null;
    }
  } catch (e) {
    console.warn('[riskFeedback] recompute failed', e);
  }

  // 3) Snapshot for history
  if (riskAfter) {
    try {
      // Table added in migration; cast until types are regenerated
      const { data: snap, error: snapErr } = await (supabase as any)
        .from('component_risk_snapshots')
        .insert({
          component_id: componentId,
          organization_id: orgId,
          work_order_id: workOrderId,
          risk_score: riskAfter.riskScore,
          risk_level: riskAfter.riskLevel,
          confidence: riskAfter.confidence,
          recommendation: riskAfter.recommendation,
          trigger_source: 'wo_completed',
          metadata: {
            age_years: riskAfter.ageYears,
            acute_count: riskAfter.acuteCount,
            remaining_b10: riskAfter.remainingB10Years,
            reliability: riskAfter.reliability,
          },
        })
        .select('id')
        .single();
      if (!snapErr) snapshotId = snap?.id ?? null;
      else console.warn('[riskFeedback] snapshot insert', snapErr.message);
    } catch (e) {
      console.warn('[riskFeedback] snapshot failed', e);
    }
  }

  return { closedSuggestions, snapshotId, riskAfter };
}
