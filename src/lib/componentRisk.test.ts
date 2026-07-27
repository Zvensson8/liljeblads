import { describe, expect, it } from 'vitest';
import {
  computeComponentRisk,
  computeComponentRiskBatch,
  filterRiskResults,
  riskLevelMeetsMin,
} from '@/lib/componentRisk';

const asOf = new Date('2026-07-27');

describe('componentRisk', () => {
  it('old component with acutes is elevated risk', () => {
    const r = computeComponentRisk({
      componentId: 'old',
      name: 'Old HP',
      type: 'SC4.6.2.6',
      installationYear: 2005,
      purchaseDate: null,
      expectedLifespanYears: 15,
      history: [
        { performed_date: '2015-01-01', category: 'acute' },
        { performed_date: '2018-06-01', category: 'acute' },
        { performed_date: '2021-03-01', category: 'acute' },
        { performed_date: '2023-09-01', category: 'acute' },
      ],
      asOf,
    });
    expect(r.ageYears).toBeGreaterThan(20);
    expect(r.riskScore).toBeGreaterThanOrEqual(30);
    expect(r.riskLevel).not.toBe('low');
  });

  it('new component scores lower than old', () => {
    const old = computeComponentRisk({
      componentId: 'old',
      installationYear: 2005,
      purchaseDate: null,
      expectedLifespanYears: 15,
      history: [],
      asOf,
    });
    const neu = computeComponentRisk({
      componentId: 'new',
      installationYear: 2024,
      purchaseDate: null,
      expectedLifespanYears: 20,
      history: [],
      asOf,
    });
    expect(neu.riskScore).toBeLessThan(old.riskScore);
  });

  it('unknown age → low confidence', () => {
    const r = computeComponentRisk({
      componentId: 'unk',
      installationYear: null,
      purchaseDate: null,
      expectedLifespanYears: null,
      history: [],
      asOf,
    });
    expect(r.confidence).toBe('low');
    expect(r.ageYears).toBe(0);
  });

  it('batch sorts by risk desc', () => {
    const batch = computeComponentRiskBatch([
      {
        componentId: 'a',
        installationYear: 2000,
        purchaseDate: null,
        expectedLifespanYears: 12,
        history: [],
        asOf,
      },
      {
        componentId: 'b',
        installationYear: 2023,
        purchaseDate: null,
        expectedLifespanYears: 20,
        history: [],
        asOf,
      },
    ]);
    expect(batch[0].riskScore).toBeGreaterThanOrEqual(batch[1].riskScore);
  });

  it('filterRiskResults respects minLevel', () => {
    const batch = computeComponentRiskBatch([
      {
        componentId: 'a',
        installationYear: 1995,
        purchaseDate: null,
        expectedLifespanYears: 10,
        history: [],
        asOf,
      },
      {
        componentId: 'b',
        installationYear: 2024,
        purchaseDate: null,
        expectedLifespanYears: 20,
        history: [],
        asOf,
      },
    ]);
    const high = filterRiskResults(batch, { minLevel: 'high' });
    expect(high.every((r) => riskLevelMeetsMin(r.riskLevel, 'high'))).toBe(true);
  });
});
