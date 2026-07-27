import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import {
  computeComponentRisk,
  computeComponentRiskBatch,
  type ComponentRiskInput,
  type ComponentRiskResult,
} from '@/lib/componentRisk';

async function fetchComponentRiskData(componentId: string): Promise<ComponentRiskInput> {
  const [compRes, purchaseRes, histRes] = await Promise.all([
    supabase
      .from('components')
      .select('id, name, type, installation_year')
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

  if (compRes.error) throw compRes.error;

  return {
    componentId,
    name: compRes.data.name,
    type: compRes.data.type,
    installationYear: compRes.data.installation_year,
    purchaseDate: purchaseRes.data?.purchase_date ?? null,
    expectedLifespanYears: purchaseRes.data?.expected_lifespan_years ?? null,
    history: (histRes.data ?? []).map((h) => ({
      performed_date: h.performed_date,
      category: h.category,
    })),
  };
}

/**
 * Risk for a single component (Weibull).
 */
export function useComponentRisk(componentId: string | undefined | null) {
  const { session } = useAuth();

  return useQuery({
    queryKey: [...queryKeys.components.detail(componentId ?? 'none'), 'risk'] as const,
    queryFn: async (): Promise<ComponentRiskResult> => {
      const input = await fetchComponentRiskData(componentId!);
      return computeComponentRisk(input);
    },
    enabled: !!session && !!componentId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

export interface ComponentRiskListFilters {
  propertyId?: string;
  /** Max number of highest-risk components to return */
  limit?: number;
}

/**
 * Batch risk for components (optionally scoped to a property).
 * Sorted highest risk first.
 */
export function useComponentRiskList(filters: ComponentRiskListFilters = {}) {
  const { session } = useAuth();
  const limit = filters.limit ?? 50;

  return useQuery({
    queryKey: ['component-risk-list', filters.propertyId ?? 'all', limit] as const,
    queryFn: async (): Promise<ComponentRiskResult[]> => {
      let compQuery = supabase
        .from('components')
        .select('id, name, type, installation_year, property_id')
        .neq('status', 'decommissioned');

      if (filters.propertyId) {
        compQuery = compQuery.eq('property_id', filters.propertyId);
      }

      const { data: components, error: compErr } = await compQuery;
      if (compErr) throw compErr;
      if (!components?.length) return [];

      const ids = components.map((c) => c.id);

      const [purchaseRes, histRes] = await Promise.all([
        supabase
          .from('component_purchase_info')
          .select('component_id, expected_lifespan_years, purchase_date')
          .in('component_id', ids),
        supabase
          .from('maintenance_history')
          .select('component_id, performed_date, category')
          .in('component_id', ids)
          .order('performed_date', { ascending: true }),
      ]);

      const purchaseMap = new Map(
        (purchaseRes.data ?? []).map((p) => [p.component_id, p]),
      );
      const histMap = new Map<string, Array<{ performed_date: string; category: string | null }>>();
      for (const h of histRes.data ?? []) {
        const list = histMap.get(h.component_id) ?? [];
        list.push({ performed_date: h.performed_date, category: h.category });
        histMap.set(h.component_id, list);
      }

      const inputs: ComponentRiskInput[] = components.map((c) => {
        const p = purchaseMap.get(c.id);
        return {
          componentId: c.id,
          name: c.name,
          type: c.type,
          installationYear: c.installation_year,
          purchaseDate: p?.purchase_date ?? null,
          expectedLifespanYears: p?.expected_lifespan_years ?? null,
          history: histMap.get(c.id) ?? [],
        };
      });

      return computeComponentRiskBatch(inputs).slice(0, limit);
    },
    enabled: !!session,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

export type { ComponentRiskResult, RiskLevel, Confidence } from '@/lib/componentRisk';
export {
  riskLevelLabel,
  riskLevelColor,
} from '@/lib/componentRisk';
