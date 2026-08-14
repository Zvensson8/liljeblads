import { describe, expect, it } from 'vitest';
import {
  filterAndSortComponents,
  hasActiveComponentFilters,
  uniqueComponentManufacturers,
  uniqueComponentTypes,
} from '@/lib/componentsListFilter';
import type { ComponentRiskResult } from '@/lib/componentRisk';

const emptyFilters = {
  searchQuery: '',
  filterType: 'all',
  filterProperty: 'all',
  filterManufacturer: 'all',
  filterModel: 'all',
  filterService: 'all' as const,
  filterRisk: 'all' as const,
  sortBy: 'default' as const,
};

const comps = [
  {
    id: '1',
    name: 'Ventilation A',
    type: 'SC4.7',
    manufacturer: 'A',
    model: 'M1',
    serial_number: 'SN-1',
    property_id: 'p1',
    property_name: 'P1',
  },
  {
    id: '2',
    name: 'Värmepump B',
    type: 'SC1',
    manufacturer: 'B',
    model: 'M2',
    serial_number: null,
    property_id: 'p2',
    property_name: 'P2',
  },
];

const riskById = new Map<string, ComponentRiskResult>([
  [
    '1',
    {
      componentId: '1',
      ageYears: 10,
      params: { shape: 2, scale: 15, n: 0, method: 'prior' },
      reliability: 0.5,
      failureProbability: 0.5,
      hazardRate: 0.1,
      remainingB10Years: 1,
      medianLifeYears: 12,
      riskScore: 80,
      riskLevel: 'high',
      confidence: 'medium',
      acuteCount: 0,
      recommendation: 'x',
    },
  ],
  [
    '2',
    {
      componentId: '2',
      ageYears: 2,
      params: { shape: 2, scale: 15, n: 0, method: 'prior' },
      reliability: 0.9,
      failureProbability: 0.1,
      hazardRate: 0.05,
      remainingB10Years: 8,
      medianLifeYears: 12,
      riskScore: 10,
      riskLevel: 'low',
      confidence: 'medium',
      acuteCount: 0,
      recommendation: 'x',
    },
  ],
]);

describe('componentsListFilter', () => {
  it('filters by type', () => {
    const out = filterAndSortComponents(
      comps,
      { ...emptyFilters, filterType: 'SC4.7' },
      {},
      riskById,
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('1');
  });

  it('filters by property id and search', () => {
    expect(
      filterAndSortComponents(
        comps,
        { ...emptyFilters, filterProperty: 'p2' },
        {},
        riskById,
      ).map((c) => c.id),
    ).toEqual(['2']);

    expect(
      filterAndSortComponents(
        comps,
        { ...emptyFilters, searchQuery: 'värme' },
        {},
        riskById,
      ).map((c) => c.id),
    ).toEqual(['2']);
  });

  it('filters and sorts by risk', () => {
    const out = filterAndSortComponents(
      comps,
      { ...emptyFilters, filterRisk: 'high', sortBy: 'risk' },
      {},
      riskById,
    );
    expect(out.map((c) => c.id)).toEqual(['1']);
  });

  it('filters by missing service', () => {
    const stats = { '1': { lastDate: '2026-01-01' } };
    expect(
      filterAndSortComponents(
        comps,
        { ...emptyFilters, filterService: 'none' },
        stats,
        riskById,
      ).map((c) => c.id),
    ).toEqual(['2']);
  });

  it('hasActiveComponentFilters', () => {
    expect(hasActiveComponentFilters(emptyFilters)).toBe(false);
    expect(hasActiveComponentFilters({ ...emptyFilters, filterType: 'SC1' })).toBe(true);
    expect(hasActiveComponentFilters({ ...emptyFilters, searchQuery: 'vent' })).toBe(true);
  });

  it('lists unique types and manufacturers in Swedish order', () => {
    expect(uniqueComponentTypes(comps)).toEqual(['SC1', 'SC4.7']);
    expect(uniqueComponentManufacturers(comps)).toEqual(['A', 'B']);
  });
});
