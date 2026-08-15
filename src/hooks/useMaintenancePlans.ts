import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import type {
  PlanActionType,
  PlanCostSource,
  PlanItemDraft,
  Quarter,
} from '@/lib/maintenancePlanEngine';
import type { Confidence, RiskLevel } from '@/lib/componentRisk';

export interface MaintenancePlan {
  id: string;
  organization_id: string;
  property_id: string;
  name: string;
  start_year: number;
  start_quarter: number;
  horizon_years: number;
  min_risk_level: string;
  min_confidence: string;
  status: string;
  generated_at: string;
  generated_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenancePlanItem {
  id: string;
  plan_id: string;
  component_id: string | null;
  year: number;
  quarter: number;
  action_type: string;
  title: string;
  risk_level: string;
  risk_score: number;
  remaining_b10_years: number | null;
  confidence: string;
  estimated_cost: number | null;
  cost_source: string | null;
  sort_order: number;
  status: string;
  notes: string | null;
  source: string;
  external_id: string | null;
  user_edited?: boolean;
  created_at: string;
  components?: {
    id: string;
    name: string;
    type: string | null;
  } | null;
}

export interface CreateMaintenancePlanInput {
  organizationId: string;
  propertyId: string;
  propertyName?: string;
  startYear: number;
  startQuarter: Quarter;
  horizonYears: number;
  minRiskLevel: RiskLevel;
  minConfidence: Confidence;
  items: PlanItemDraft[];
  notes?: string;
}

function planName(
  propertyName: string | undefined,
  startYear: number,
  startQuarter: number,
  horizonYears: number,
): string {
  const prop = propertyName?.trim() || 'Fastighet';
  return `Underhållsplan ${prop} Q${startQuarter} ${startYear} (${horizonYears} år)`;
}

export function useMaintenancePlans(propertyId: string | undefined) {
  const { session } = useAuth();

  return useQuery({
    queryKey: queryKeys.maintenancePlans.byProperty(propertyId ?? 'none'),
    queryFn: async (): Promise<MaintenancePlan[]> => {
      const { data, error } = await supabase
        .from('maintenance_plans')
        .select('*')
        .eq('property_id', propertyId!)
        .order('generated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as MaintenancePlan[];
    },
    enabled: !!session && !!propertyId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useActiveMaintenancePlan(propertyId: string | undefined) {
  const { session } = useAuth();

  return useQuery({
    queryKey: [
      ...queryKeys.maintenancePlans.byProperty(propertyId ?? 'none'),
      'active',
    ] as const,
    queryFn: async (): Promise<MaintenancePlan | null> => {
      const { data, error } = await supabase
        .from('maintenance_plans')
        .select('*')
        .eq('property_id', propertyId!)
        .eq('status', 'active')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as MaintenancePlan) ?? null;
    },
    enabled: !!session && !!propertyId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useMaintenancePlanItems(planId: string | undefined | null) {
  const { session } = useAuth();

  return useQuery({
    queryKey: queryKeys.maintenancePlans.items(planId ?? 'none'),
    queryFn: async (): Promise<MaintenancePlanItem[]> => {
      const { data, error } = await supabase
        .from('maintenance_plan_items')
        .select(
          '*, components(id, name, type)',
        )
        .eq('plan_id', planId!)
        .neq('status', 'skipped')
        .order('year', { ascending: true })
        .order('quarter', { ascending: true })
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as MaintenancePlanItem[];
    },
    enabled: !!session && !!planId,
    staleTime: 1000 * 60 * 2,
  });
}

export function useCreateMaintenancePlan() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateMaintenancePlanInput): Promise<MaintenancePlan> => {
      const { data: oldActive, error: oldErr } = await supabase
        .from('maintenance_plans')
        .select('id')
        .eq('property_id', input.propertyId)
        .eq('status', 'active');
      if (oldErr) throw oldErr;
      const oldIds = (oldActive ?? []).map((p) => p.id);

      // Archive previous active plans for this property
      const { error: archiveErr } = await supabase
        .from('maintenance_plans')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('property_id', input.propertyId)
        .eq('status', 'active');
      if (archiveErr) throw archiveErr;

      const { data: plan, error: planErr } = await supabase
        .from('maintenance_plans')
        .insert({
          organization_id: input.organizationId,
          property_id: input.propertyId,
          name: planName(
            input.propertyName,
            input.startYear,
            input.startQuarter,
            input.horizonYears,
          ),
          start_year: input.startYear,
          start_quarter: input.startQuarter,
          horizon_years: input.horizonYears,
          min_risk_level: input.minRiskLevel,
          min_confidence: input.minConfidence,
          status: 'active',
          generated_by: user?.id ?? null,
          notes: input.notes ?? null,
        })
        .select('*')
        .single();

      if (planErr) throw planErr;

      if (input.items.length > 0) {
        const rows = input.items.map((item, i) => ({
          plan_id: plan.id,
          component_id: item.componentId,
          year: item.year,
          quarter: item.quarter,
          action_type: item.actionType as PlanActionType,
          title: item.title,
          risk_level: item.riskLevel,
          risk_score: item.riskScore,
          remaining_b10_years: item.remainingB10Years,
          confidence: item.confidence,
          estimated_cost: item.estimatedCost,
          cost_source: item.costSource as PlanCostSource | null,
          sort_order: item.sortOrder ?? i,
          status: 'planned',
          source: 'weibull',
          user_edited: false,
        }));

        const { error: itemsErr } = await supabase
          .from('maintenance_plan_items')
          .insert(rows);
        if (itemsErr) {
          // Best-effort cleanup of empty plan header
          await supabase.from('maintenance_plans').delete().eq('id', plan.id);
          throw itemsErr;
        }
      }

      if (oldIds.length > 0) {
        const { error: moveErr } = await supabase
          .from('maintenance_plan_items')
          .update({ plan_id: plan.id })
          .in('plan_id', oldIds)
          .eq('source', 'energypulse')
          .neq('status', 'skipped');
        if (moveErr) throw moveErr;
      }

      return plan as MaintenancePlan;
    },
    onSuccess: (plan) => {
      qc.invalidateQueries({
        queryKey: queryKeys.maintenancePlans.byProperty(plan.property_id),
      });
    },
  });
}

export function useCreateManualPlanItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      planId: string;
      propertyId: string;
      title: string;
      year: number;
      quarter: number;
      estimated_cost: number | null;
      notes: string | null;
      componentId?: string | null;
    }) => {
      const { error } = await supabase.from('maintenance_plan_items').insert({
        plan_id: input.planId,
        component_id: input.componentId || null,
        year: input.year,
        quarter: input.quarter,
        action_type: 'service',
        title: input.title.trim(),
        notes: input.notes,
        estimated_cost: input.estimated_cost,
        cost_source: 'manual',
        risk_level: 'medium',
        risk_score: 0,
        confidence: 'medium',
        status: 'planned',
        source: 'manual',
        user_edited: true,
        sort_order: 0,
      });
      if (error) throw error;
      return input;
    },
    onSuccess: (input) => {
      qc.invalidateQueries({
        queryKey: queryKeys.maintenancePlans.items(input.planId),
      });
      qc.invalidateQueries({ queryKey: queryKeys.maintenancePlans.all });
    },
  });
}

export function useSyncWeibullPlan() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      organizationId: string;
      propertyId: string;
      propertyName?: string;
      drafts: PlanItemDraft[];
    }): Promise<{ planId: string; created: number; updated: number; skipped: number }> => {
      const { planWeibullMerge } = await import('@/lib/mergeWeibullPlan');
      const { earliestPlanQuarter } = await import('@/lib/maintenancePlanEngine');

      let { data: plan, error: planErr } = await supabase
        .from('maintenance_plans')
        .select('*')
        .eq('property_id', input.propertyId)
        .eq('status', 'active')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (planErr) throw planErr;

      if (!plan) {
        const start = earliestPlanQuarter();
        const created = await supabase
          .from('maintenance_plans')
          .insert({
            organization_id: input.organizationId,
            property_id: input.propertyId,
            name: planName(input.propertyName, start.year, start.quarter, 5),
            start_year: start.year,
            start_quarter: start.quarter,
            horizon_years: 5,
            min_risk_level: 'high',
            min_confidence: 'medium',
            status: 'active',
            generated_by: user?.id ?? null,
          })
          .select('*')
          .single();
        if (created.error || !created.data) throw created.error ?? new Error('Kunde inte skapa plan');
        plan = created.data;
      }

      const { data: existing, error: exErr } = await supabase
        .from('maintenance_plan_items')
        .select('id, component_id, source, status, user_edited')
        .eq('plan_id', plan.id);
      if (exErr) throw exErr;

      const decisions = planWeibullMerge(existing ?? [], input.drafts);
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const d of decisions) {
        if (d.kind === 'skip') {
          skipped += 1;
          continue;
        }
        const row = {
          year: d.draft.year,
          quarter: d.draft.quarter,
          action_type: d.draft.actionType,
          title: d.draft.title,
          risk_level: d.draft.riskLevel,
          risk_score: d.draft.riskScore,
          remaining_b10_years: d.draft.remainingB10Years,
          confidence: d.draft.confidence,
          estimated_cost: d.draft.estimatedCost,
          cost_source: d.draft.costSource,
        };
        if (d.kind === 'insert') {
          const { error } = await supabase.from('maintenance_plan_items').insert({
            ...row,
            plan_id: plan.id,
            component_id: d.draft.componentId,
            status: 'planned',
            source: 'weibull',
            user_edited: false,
            sort_order: d.draft.sortOrder,
          });
          if (error) throw error;
          created += 1;
        } else {
          const { error } = await supabase
            .from('maintenance_plan_items')
            .update(row)
            .eq('id', d.id);
          if (error) throw error;
          updated += 1;
        }
      }

      await supabase
        .from('maintenance_plans')
        .update({ generated_at: new Date().toISOString() })
        .eq('id', plan.id);

      return { planId: plan.id, created, updated, skipped };
    },
    onSuccess: (data, input) => {
      qc.invalidateQueries({
        queryKey: queryKeys.maintenancePlans.byProperty(input.propertyId),
      });
      qc.invalidateQueries({
        queryKey: queryKeys.maintenancePlans.items(data.planId),
      });
      qc.invalidateQueries({ queryKey: queryKeys.maintenancePlans.all });
    },
  });
}

export interface OrgActivePlan {
  id: string;
  property_id: string;
  name: string;
  start_year: number;
  start_quarter: number;
  horizon_years: number;
  generated_at: string;
  properties: { id: string; name: string } | null;
  maintenance_plan_items: Array<{
    id: string;
    year: number;
    quarter: number;
    title: string;
    estimated_cost: number | null;
    source: string;
    status: string;
    risk_level: string;
  }>;
}

export function useOrgActiveMaintenancePlans(organizationId: string | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: queryKeys.maintenancePlans.byOrg(organizationId ?? 'none'),
    queryFn: async (): Promise<OrgActivePlan[]> => {
      const { data, error } = await supabase
        .from('maintenance_plans')
        .select(
          'id, property_id, name, start_year, start_quarter, horizon_years, generated_at, properties(id, name), maintenance_plan_items(id, year, quarter, title, estimated_cost, source, status, risk_level)',
        )
        .eq('organization_id', organizationId!)
        .eq('status', 'active')
        .order('generated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OrgActivePlan[];
    },
    enabled: !!session && !!organizationId,
    staleTime: 1000 * 60 * 2,
  });
}

export interface UpdatePlanItemInput {
  id: string;
  planId: string;
  propertyId: string;
  year: number;
  quarter: number;
  title: string;
  notes: string | null;
  estimated_cost: number | null;
  source: string;
  external_id: string | null;
}

export function useUpdateMaintenancePlanItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdatePlanItemInput): Promise<UpdatePlanItemInput> => {
      const { error } = await supabase
        .from('maintenance_plan_items')
        .update({
          year: input.year,
          quarter: input.quarter,
          title: input.title.trim(),
          notes: input.notes,
          estimated_cost: input.estimated_cost,
          cost_source: 'manual',
          user_edited: true,
        })
        .eq('id', input.id);
      if (error) throw error;

      if (input.source === 'energypulse' && input.external_id) {
        const { notifyEnergyPulsePlanItemUpdated } = await import(
          '@/lib/notifyEnergyPulse'
        );
        await notifyEnergyPulsePlanItemUpdated({
          propertyId: input.propertyId,
          planItemId: input.id,
          actionId: input.external_id,
          title: input.title.trim(),
          notes: input.notes,
          plannedYear: input.year,
          plannedQuarter: input.quarter,
          investmentCost: input.estimated_cost,
        });
      }
      return input;
    },
    onSuccess: (input) => {
      qc.invalidateQueries({
        queryKey: queryKeys.maintenancePlans.items(input.planId),
      });
      qc.invalidateQueries({ queryKey: queryKeys.maintenancePlans.all });
    },
  });
}

export function useDeleteMaintenancePlanItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      planId: string;
      propertyId: string;
      source: string;
      external_id: string | null;
    }) => {
      const { error } = await supabase
        .from('maintenance_plan_items')
        .update({ status: 'skipped', user_edited: true })
        .eq('id', input.id);
      if (error) throw error;

      if (input.source === 'energypulse' && input.external_id) {
        const { notifyEnergyPulsePlanItemRemoved } = await import(
          '@/lib/notifyEnergyPulse'
        );
        await notifyEnergyPulsePlanItemRemoved({
          propertyId: input.propertyId,
          planItemId: input.id,
          actionId: input.external_id,
        });
      }
      return input;
    },
    onSuccess: (input) => {
      qc.invalidateQueries({
        queryKey: queryKeys.maintenancePlans.items(input.planId),
      });
      qc.invalidateQueries({ queryKey: queryKeys.maintenancePlans.all });
    },
  });
}

export function useArchiveMaintenancePlan() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (plan: Pick<MaintenancePlan, 'id' | 'property_id'>) => {
      const { error } = await supabase
        .from('maintenance_plans')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', plan.id);
      if (error) throw error;
      return plan;
    },
    onSuccess: (plan) => {
      qc.invalidateQueries({
        queryKey: queryKeys.maintenancePlans.byProperty(plan.property_id),
      });
    },
  });
}

/** Fetch purchase_cost map for component ids (plan cost fallback). */
export async function fetchPurchaseCostMap(
  componentIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!componentIds.length) return map;

  // Chunk to avoid URL limits
  const chunkSize = 100;
  for (let i = 0; i < componentIds.length; i += chunkSize) {
    const chunk = componentIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('component_purchase_info')
      .select('component_id, purchase_cost')
      .in('component_id', chunk);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.purchase_cost != null) {
        map.set(row.component_id, Number(row.purchase_cost));
      }
    }
  }
  return map;
}

/** Fetch active unit prices for org (áprislista → plan cost estimates). */
export async function fetchUnitPriceMap(
  organizationId: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const { data, error } = await supabase
    .from('component_unit_prices')
    .select('component_type, replacement_cost')
    .eq('organization_id', organizationId)
    .eq('is_active', true);
  if (error) {
    // Table may not be migrated yet — soft fail
    console.warn('unit prices fetch:', error.message);
    return map;
  }
  for (const row of data ?? []) {
    // Keep both original and lowercase keys for loose matching in engine
    const cost = Number(row.replacement_cost);
    map.set(row.component_type, cost);
    map.set(row.component_type.trim().toLowerCase(), cost);
  }
  return map;
}
