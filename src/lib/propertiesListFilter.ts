import type { Property } from '@/types/domain/property';

export interface PropertiesListFilters {
  searchQuery: string;
  typeFilter: string;
}

export function filterProperties(
  properties: Property[],
  filters: PropertiesListFilters,
): Property[] {
  const q = filters.searchQuery.trim().toLowerCase();
  const type = filters.typeFilter.trim().toLowerCase();

  return properties.filter((property) => {
    const matchesSearch =
      !q ||
      property.name.toLowerCase().includes(q) ||
      (property.address ?? '').toLowerCase().includes(q) ||
      (property.property_number ?? '').toLowerCase().includes(q) ||
      (property.description ?? '').toLowerCase().includes(q);

    const matchesType =
      !type ||
      type === 'all' ||
      (property.property_type ?? '').toLowerCase() === type;

    return matchesSearch && matchesType;
  });
}

export function uniquePropertyTypes(properties: Property[]): string[] {
  const set = new Set<string>();
  for (const p of properties) {
    const t = p.property_type?.trim();
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'sv'));
}
