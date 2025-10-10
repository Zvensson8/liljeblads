import { supabase } from "@/integrations/supabase/client";

export interface ComponentCostSummary {
  component_id: string;
  component_name: string;
  component_type: string;
  total_cost: number;
  maintenance_count: number;
  last_maintenance_date: string | null;
  flag_type: 'red' | 'yellow' | 'purple' | 'black' | null;
  flag_reason: string;
}

export interface CostTrend {
  month: string;
  cost: number;
}

export interface SupplierAnalysis {
  supplier: string;
  total_cost: number;
  action_count: number;
  avg_cost: number;
}

export async function getTopCostComponents(limit: number = 10, months: number = 12): Promise<ComponentCostSummary[]> {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const { data: maintenanceData, error } = await supabase
    .from('maintenance_history')
    .select(`
      component_id,
      cost,
      performed_date,
      components (
        id,
        name,
        type,
        floor_id,
        floors (
          property_id,
          properties (
            owner_id
          )
        )
      )
    `)
    .gte('performed_date', startDate.toISOString().split('T')[0])
    .not('cost', 'is', null);

  if (error) {
    console.error('Error fetching maintenance data:', error);
    return [];
  }

  // Group by component and calculate totals
  const componentMap = new Map<string, {
    name: string;
    type: string;
    total_cost: number;
    count: number;
    last_date: string | null;
  }>();

  maintenanceData?.forEach((record: any) => {
    const component = record.components;
    if (!component) return;

    const existing = componentMap.get(record.component_id) || {
      name: component.name,
      type: component.type,
      total_cost: 0,
      count: 0,
      last_date: null
    };

    existing.total_cost += Number(record.cost || 0);
    existing.count += 1;
    if (!existing.last_date || record.performed_date > existing.last_date) {
      existing.last_date = record.performed_date;
    }

    componentMap.set(record.component_id, existing);
  });

  // Convert to array and sort by cost
  const components = Array.from(componentMap.entries())
    .map(([id, data]) => ({
      component_id: id,
      component_name: data.name,
      component_type: data.type,
      total_cost: data.total_cost,
      maintenance_count: data.count,
      last_maintenance_date: data.last_date,
      flag_type: determineFlagType(data.total_cost, data.count, months),
      flag_reason: getFlagReason(data.total_cost, data.count, months)
    }))
    .sort((a, b) => b.total_cost - a.total_cost)
    .slice(0, limit);

  return components;
}

function determineFlagType(totalCost: number, maintenanceCount: number, months: number): 'red' | 'yellow' | 'purple' | 'black' | null {
  // Purple: More than 3 maintenance actions in 6 months
  if (months >= 6 && maintenanceCount > 3) return 'purple';
  
  // Red: Over 50,000 SEK per year
  const yearlyRate = (totalCost / months) * 12;
  if (yearlyRate > 50000) return 'red';
  
  // Black: Total cost very high (placeholder - needs purchase info)
  if (totalCost > 100000) return 'black';
  
  // Yellow: High cost (over 30,000 SEK/year)
  if (yearlyRate > 30000) return 'yellow';
  
  return null;
}

function getFlagReason(totalCost: number, maintenanceCount: number, months: number): string {
  const yearlyRate = (totalCost / months) * 12;
  
  if (months >= 6 && maintenanceCount > 3) {
    return `Frekvent underhåll: ${maintenanceCount} åtgärder på ${months} månader`;
  }
  if (yearlyRate > 50000) {
    return `Högkostnad: ${Math.round(yearlyRate).toLocaleString('sv-SE')} SEK/år`;
  }
  if (totalCost > 100000) {
    return `Total kostnad mycket hög: ${Math.round(totalCost).toLocaleString('sv-SE')} SEK`;
  }
  if (yearlyRate > 30000) {
    return `Förhöjd kostnad: ${Math.round(yearlyRate).toLocaleString('sv-SE')} SEK/år`;
  }
  
  return 'Inom normala värden';
}

export async function getCostTrend(months: number = 12): Promise<CostTrend[]> {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const { data, error } = await supabase
    .from('maintenance_history')
    .select('performed_date, cost')
    .gte('performed_date', startDate.toISOString().split('T')[0])
    .not('cost', 'is', null)
    .order('performed_date');

  if (error) {
    console.error('Error fetching cost trend:', error);
    return [];
  }

  // Group by month
  const monthMap = new Map<string, number>();
  
  data?.forEach((record) => {
    const date = new Date(record.performed_date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const existing = monthMap.get(monthKey) || 0;
    monthMap.set(monthKey, existing + Number(record.cost || 0));
  });

  return Array.from(monthMap.entries())
    .map(([month, cost]) => ({ month, cost }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export async function getSupplierAnalysis(): Promise<SupplierAnalysis[]> {
  const { data, error } = await supabase
    .from('maintenance_history')
    .select('supplier, cost')
    .not('supplier', 'is', null)
    .not('cost', 'is', null);

  if (error) {
    console.error('Error fetching supplier data:', error);
    return [];
  }

  const supplierMap = new Map<string, { total: number; count: number }>();

  data?.forEach((record) => {
    const supplier = record.supplier || 'Okänd';
    const existing = supplierMap.get(supplier) || { total: 0, count: 0 };
    existing.total += Number(record.cost || 0);
    existing.count += 1;
    supplierMap.set(supplier, existing);
  });

  return Array.from(supplierMap.entries())
    .map(([supplier, data]) => ({
      supplier,
      total_cost: data.total,
      action_count: data.count,
      avg_cost: data.total / data.count
    }))
    .sort((a, b) => b.total_cost - a.total_cost);
}

export async function getComponentLifecycleCost(componentId: string) {
  const [maintenanceResult, purchaseResult, componentResult] = await Promise.all([
    supabase
      .from('maintenance_history')
      .select('cost, performed_date')
      .eq('component_id', componentId)
      .not('cost', 'is', null),
    supabase
      .from('component_purchase_info')
      .select('*')
      .eq('component_id', componentId)
      .maybeSingle(),
    supabase
      .from('components')
      .select('name, type, installation_year')
      .eq('id', componentId)
      .single()
  ]);

  if (maintenanceResult.error || componentResult.error) {
    console.error('Error fetching lifecycle data:', maintenanceResult.error || componentResult.error);
    return null;
  }

  const totalMaintenanceCost = maintenanceResult.data?.reduce((sum, r) => sum + Number(r.cost || 0), 0) || 0;
  const purchaseCost = purchaseResult.data?.purchase_cost ? Number(purchaseResult.data.purchase_cost) : 0;
  const totalCost = purchaseCost + totalMaintenanceCost;

  const currentYear = new Date().getFullYear();
  const installationYear = componentResult.data.installation_year || currentYear;
  const yearsInService = currentYear - installationYear + 1;
  const costPerYear = yearsInService > 0 ? totalCost / yearsInService : totalCost;

  return {
    component: componentResult.data,
    purchaseInfo: purchaseResult.data,
    totalMaintenanceCost,
    totalCost,
    yearsInService,
    costPerYear,
    maintenanceCount: maintenanceResult.data?.length || 0
  };
}

export function getFlagEmoji(flagType: string | null): string {
  switch (flagType) {
    case 'red': return '🔴';
    case 'yellow': return '🟡';
    case 'purple': return '🟣';
    case 'black': return '⚫';
    default: return '✅';
  }
}
