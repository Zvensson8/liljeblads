import { describe, expect, it } from 'vitest';
import {
  budgetVarianceClass,
  filterAndSortProjects,
  type ProjectListItem,
} from '@/lib/projectsListFilter';

const projects: ProjectListItem[] = [
  {
    id: '1',
    project_number: 'P-001',
    name: 'Takbyte',
    type: 'underhall',
    status: 'pagaende',
    property_id: 'a',
    year: 2026,
    start_quarter: 1,
    budget: 100,
    actual_cost: 50,
    updated_at: '2026-01-01',
    property: { name: 'Automaten 11' },
  },
  {
    id: '2',
    project_number: 'P-002',
    name: 'Värme',
    type: 'investering',
    status: 'planerat',
    property_id: 'b',
    year: 2025,
    start_quarter: 4,
    budget: 100,
    actual_cost: 130,
    updated_at: '2026-02-01',
    property: { name: 'Hjulet 1' },
  },
];

describe('projectsListFilter', () => {
  it('filters by search and status', () => {
    const out = filterAndSortProjects(projects, {
      searchQuery: 'tak',
      statusFilter: 'pagaende',
      typeFilter: 'all',
      propertyFilter: 'all',
      sortField: 'name',
      sortDirection: 'asc',
    });
    expect(out.map((p) => p.id)).toEqual(['1']);
  });

  it('sorts by quarter', () => {
    const out = filterAndSortProjects(projects, {
      searchQuery: '',
      statusFilter: 'all',
      typeFilter: 'all',
      propertyFilter: 'all',
      sortField: 'quarter',
      sortDirection: 'asc',
    });
    expect(out.map((p) => p.id)).toEqual(['2', '1']);
  });

  it('budgetVarianceClass', () => {
    expect(budgetVarianceClass(100, 0)).toBe('text-muted-foreground');
    expect(budgetVarianceClass(100, 50)).toBe('text-green-600');
    expect(budgetVarianceClass(100, 105)).toBe('text-yellow-600');
    expect(budgetVarianceClass(100, 120)).toBe('text-red-600');
  });
});
