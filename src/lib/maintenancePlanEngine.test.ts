import { describe, expect, it } from 'vitest';
import type { ComponentRiskResult } from '@/lib/componentRisk';
import {
  computePlanPeriod,
  formatPlanPeriod,
  generateMaintenancePlanItems,
  nextCalendarQuarter,
  resolveEstimatedCost,
  summarizePlanItems,
} from '@/lib/maintenancePlanEngine';

const base = {
  ageYears: 10,
  params: { shape: 2, scale: 15, n: 0, method: 'prior' as const },
  reliability: 0.5,
  failureProbability: 0.5,
  hazardRate: 0.1,
  medianLifeYears: 12,
  acuteCount: 1,
  recommendation: 'Planera byte',
};

function risk(partial: Partial<ComponentRiskResult> & { componentId: string }): ComponentRiskResult {
  return { ...base, riskScore: 50, riskLevel: 'medium', confidence: 'medium', remainingB10Years: 2, ...partial };
}

describe('maintenancePlanEngine', () => {
  it('formats 5-year period from Q2 2027', () => {
    const period = computePlanPeriod(2027, 2, 5);
    expect(formatPlanPeriod(period)).toBe('Q2 2027 – Q1 2032');
  });

  it('next calendar quarter from July is Q4', () => {
    const nq = nextCalendarQuarter(new Date('2026-07-27'));
    expect(nq).toEqual({ year: 2026, quarter: 4 });
  });

  it('includes critical at start quarter and excludes low / long B10', () => {
    const items = generateMaintenancePlanItems(
      [
        risk({
          componentId: 'c1',
          name: 'Entre',
          type: 'entréparti',
          riskLevel: 'critical',
          riskScore: 90,
          remainingB10Years: 0.2,
          confidence: 'high',
          recommendation: 'Byt snart',
        }),
        risk({
          componentId: 'c2',
          name: 'VP',
          type: 'SC4.6.2.6',
          riskLevel: 'high',
          riskScore: 70,
          remainingB10Years: 2,
          confidence: 'medium',
        }),
        risk({
          componentId: 'c3',
          riskLevel: 'high',
          riskScore: 60,
          remainingB10Years: 8,
          confidence: 'medium',
        }),
        risk({
          componentId: 'c4',
          riskLevel: 'low',
          riskScore: 10,
          remainingB10Years: 1,
          confidence: 'high',
        }),
      ],
      {
        startYear: 2027,
        startQuarter: 2,
        horizonYears: 5,
        minRiskLevel: 'high',
        minConfidence: 'medium',
        asOf: new Date('2026-07-27'),
        unitPricesByType: { entréparti: 100_000 },
        purchaseCosts: { c2: 50_000 },
      },
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ year: 2027, quarter: 2, componentId: 'c1' });
    expect(items.find((i) => i.componentId === 'c1')?.estimatedCost).toBe(100_000);
    expect(items.find((i) => i.componentId === 'c1')?.costSource).toBe('unit_price');
    expect(items.find((i) => i.componentId === 'c2')?.estimatedCost).toBe(50_000);
    expect(items.find((i) => i.componentId === 'c3')).toBeUndefined();
    expect(items.find((i) => i.componentId === 'c4')).toBeUndefined();
  });

  it('resolves unit price case-insensitively', () => {
    const cost = resolveEstimatedCost('x', 'ENTRÉPARTI', {
      unitPricesByType: { entréparti: 100_000 },
    });
    expect(cost).toEqual({ cost: 100_000, source: 'unit_price' });
  });

  it('summarizePlanItems totals known costs', () => {
    const items = generateMaintenancePlanItems(
      [
        risk({
          componentId: 'c1',
          type: 'entréparti',
          riskLevel: 'critical',
          riskScore: 90,
          remainingB10Years: 0.1,
          confidence: 'high',
        }),
        risk({
          componentId: 'c2',
          riskLevel: 'high',
          riskScore: 70,
          remainingB10Years: 1,
          confidence: 'medium',
        }),
      ],
      {
        startYear: 2027,
        startQuarter: 2,
        asOf: new Date('2026-07-27'),
        unitPricesByType: { entréparti: 100_000 },
        purchaseCosts: { c2: 50_000 },
      },
    );
    const sum = summarizePlanItems(items, {
      startYear: 2027,
      startQuarter: 2,
      horizonYears: 5,
    });
    expect(sum.itemCount).toBe(2);
    expect(sum.totalEstimatedCost).toBe(150_000);
  });
});
