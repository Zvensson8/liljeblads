import { describe, expect, it } from 'vitest';
import {
  filterAndSortComponents,
  hasActiveComponentFilters,
} from '@/lib/componentsListFilter';
import type { ComponentRiskResult } from '@/lib/componentRisk';

const comps = [
  {
    id: '1',
    type: 'SC4.7',
    manufacturer: 'A',
    model: 'M1',
    property_name: 'P1',
  },
  {
    id: '2',
    type: 'SC1',
    manufacturer: 'B',
    model: 'M2',
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
      {
        filterType: 'SC4.7',
        filterProperty: 'all',
        filterManufacturer: 'all',
        filterModel: 'all',
        filterService: 'all',
        filterRisk: 'all',
        sortBy: 'default',
      },
      {},
      riskById,
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('1');
  });

  it('filters and sorts by risk', () => {
    const out = filterAndSortComponents(
      comps,
      {
        filterType: 'all',
        filterProperty: 'all',
        filterManufacturer: 'all',
        filterModel: 'all',
        filterService: 'all',
        filterRisk: 'high',
        sortBy: 'risk',
      },
      {},
      riskById,
    );
    expect(out.map((c) => c.id)).toEqual(['1']);
  });

  it('hasActiveComponentFilters', () => {
    expect(
      hasActiveComponentFilters({
        filterType: 'all',
        filterProperty: 'all',
        filterManufacturer: 'all',
        filterModel: 'all',
        filterService: 'all',
        filterRisk: 'all',
        sortBy: 'default',
      }),
    ).toBe(false);
    expect(
      hasActiveComponentFilters({
        filterType: 'SC1',
        filterProperty: 'all',
        filterManufacturer: 'all',
        filterModel: 'all',
        filterService: 'all',
        filterRisk: 'all',
        sortBy: 'default',
      }),
    ).toBe(true);
  });
});
