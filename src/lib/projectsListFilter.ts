export interface ProjectListItem {
  id: string;
  project_number: string;
  name: string;
  type: string;
  status: string;
  property_id: string;
  year: number;
  start_quarter: number;
  budget: number;
  actual_cost: number;
  updated_at: string;
  property: { name: string };
}

export interface ProjectsListFilters {
  searchQuery: string;
  statusFilter: string;
  typeFilter: string;
  propertyFilter: string;
  sortField: string;
  sortDirection: 'asc' | 'desc';
}

export function filterAndSortProjects<T extends ProjectListItem>(
  projects: T[],
  filters: ProjectsListFilters,
): T[] {
  const q = filters.searchQuery.trim().toLowerCase();

  const filtered = projects.filter((project) => {
    const matchesSearch =
      !q ||
      project.name.toLowerCase().includes(q) ||
      project.project_number.toLowerCase().includes(q) ||
      project.property.name.toLowerCase().includes(q);

    const matchesStatus =
      filters.statusFilter === 'all' || project.status === filters.statusFilter;
    const matchesType =
      filters.typeFilter === 'all' || project.type === filters.typeFilter;
    const matchesProperty =
      filters.propertyFilter === 'all' ||
      project.property_id === filters.propertyFilter;

    return matchesSearch && matchesStatus && matchesType && matchesProperty;
  });

  return [...filtered].sort((a, b) => {
    let aValue: unknown = (a as Record<string, unknown>)[filters.sortField];
    let bValue: unknown = (b as Record<string, unknown>)[filters.sortField];

    if (filters.sortField === 'property_name') {
      aValue = a.property.name;
      bValue = b.property.name;
    }

    if (filters.sortField === 'quarter') {
      aValue = a.year * 10 + (a.start_quarter || 0);
      bValue = b.year * 10 + (b.start_quarter || 0);
    }

    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return filters.sortDirection === 'asc'
        ? aValue.localeCompare(bValue, 'sv')
        : bValue.localeCompare(aValue, 'sv');
    }

    if (filters.sortDirection === 'asc') {
      return aValue > bValue ? 1 : -1;
    }
    return aValue < bValue ? 1 : -1;
  });
}

export function budgetVarianceClass(budget: number, actual: number): string {
  if (actual === 0) return 'text-muted-foreground';
  if (budget === 0) return actual > 0 ? 'text-red-600' : 'text-muted-foreground';
  const variance = ((actual - budget) / budget) * 100;
  if (variance > 10) return 'text-red-600';
  if (variance > 0) return 'text-yellow-600';
  return 'text-green-600';
}
