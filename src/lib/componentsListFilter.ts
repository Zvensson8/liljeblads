import { riskLevelMeetsMin, type ComponentRiskResult, type RiskLevel } from '@/lib/componentRisk';

export type ServiceFilter = 'all' | 'latest' | 'none' | 'with_service';
export type ComponentsSort = 'default' | 'risk';

export interface ComponentsListFilters {
  searchQuery: string;
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
  name?: string | null;
  type?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  property_id?: string | null;
  property_name?: string | null;
}

export function filterAndSortComponents<T extends ComponentListRow>(
  components: T[],
  filters: ComponentsListFilters,
  maintenanceStats: Record<string, { lastDate: string | null }>,
  riskById: Map<string, ComponentRiskResult>,
): T[] {
  const {
    searchQuery,
    filterType,
    filterProperty,
    filterManufacturer,
    filterModel,
    filterService,
    filterRisk,
    sortBy,
  } = filters;

  const q = searchQuery.trim().toLowerCase();

  const result = components.filter((component) => {
    if (q) {
      const hay = [
        component.name,
        component.type,
        component.manufacturer,
        component.model,
        component.serial_number,
        component.property_name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filterType !== 'all' && component.type !== filterType) return false;
    if (
      filterProperty !== 'all' &&
      component.property_id !== filterProperty &&
      component.property_name !== filterProperty
    ) {
      return false;
    }
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
    f.searchQuery.trim().length > 0 ||
    f.filterType !== 'all' ||
    f.filterProperty !== 'all' ||
    f.filterManufacturer !== 'all' ||
    f.filterModel !== 'all' ||
    f.filterService !== 'all' ||
    f.filterRisk !== 'all' ||
    f.sortBy === 'risk'
  );
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const t = v?.trim();
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'sv'));
}

export function uniqueComponentTypes(components: ComponentListRow[]): string[] {
  return uniqueSorted(components.map((c) => c.type));
}

export function uniqueComponentManufacturers(components: ComponentListRow[]): string[] {
  return uniqueSorted(components.map((c) => c.manufacturer));
}

export function uniqueComponentModels(components: ComponentListRow[]): string[] {
  return uniqueSorted(components.map((c) => c.model));
}
