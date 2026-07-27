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
  component_id: string;
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

      return plan as MaintenancePlan;
    },
    onSuccess: (plan) => {
      qc.invalidateQueries({
        queryKey: queryKeys.maintenancePlans.byProperty(plan.property_id),
      });
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
