import { riskLevelMeetsMin, type ComponentRiskResult, type RiskLevel } from '@/lib/componentRisk';

export type ServiceFilter = 'all' | 'latest' | 'none' | 'with_service';
export type ComponentsSort = 'default' | 'risk';

export interface ComponentsListFilters {
  filterType: string;
  filterProperty: string;
  filterManufacturer: string;
  filterModel: string;
  filterService: ServiceFilter;
  filterRisk: 'all' | RiskLevel;
  sortBy: ComponentsSort;
}

export interface ComponentListRow {
  id: string;
  type: string;
  manufacturer: string | null;
  model: string | null;
  property_name?: string;
}

export function filterAndSortComponents<T extends ComponentListRow>(
  components: T[],
  filters: ComponentsListFilters,
  maintenanceStats: Record<string, { lastDate: string | null }>,
  riskById: Map<string, ComponentRiskResult>,
): T[] {
  const {
    filterType,
    filterProperty,
    filterManufacturer,
    filterModel,
    filterService,
    filterRisk,
    sortBy,
  } = filters;

  const result = components.filter((component) => {
    if (filterType !== 'all' && component.type !== filterType) return false;
    if (filterProperty !== 'all' && component.property_name !== filterProperty) return false;
    if (filterManufacturer !== 'all' && component.manufacturer !== filterManufacturer) {
      return false;
    }
    if (filterModel !== 'all' && component.model !== filterModel) return false;
    if (filterService === 'none' && maintenanceStats[component.id]?.lastDate) return false;
    if (filterService === 'with_service' && !maintenanceStats[component.id]?.lastDate) {
      return false;
    }
    if (filterRisk !== 'all') {
      const risk = riskById.get(component.id);
      if (!risk || !riskLevelMeetsMin(risk.riskLevel, filterRisk)) return false;
    }
    return true;
  });

  if (sortBy === 'risk') {
    return [...result].sort((a, b) => {
      const ra = riskById.get(a.id)?.riskScore ?? -1;
      const rb = riskById.get(b.id)?.riskScore ?? -1;
      return rb - ra;
    });
  }

  if (filterService === 'latest' || filterService === 'with_service') {
    return [...result].sort((a, b) => {
      const dateA = maintenanceStats[a.id]?.lastDate;
      const dateB = maintenanceStats[b.id]?.lastDate;
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateB.localeCompare(dateA);
    });
  }

  return result;
}

export function hasActiveComponentFilters(f: ComponentsListFilters): boolean {
  return (
    f.filterType !== 'all' ||
    f.filterProperty !== 'all' ||
    f.filterManufacturer !== 'all' ||
    f.filterModel !== 'all' ||
    f.filterService !== 'all' ||
    f.filterRisk !== 'all' ||
    f.sortBy === 'risk'
  );
}
