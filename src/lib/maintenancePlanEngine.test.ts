import { describe, expect, it } from 'vitest';
import type { ComponentRiskResult } from '@/lib/componentRisk';
import {
  computePlanPeriod,
  costRoutesToPlan,
  earliestPlanQuarter,
  formatPlanPeriod,
  generateMaintenancePlanItems,
  nextCalendarQuarter,
  PLAN_COST_THRESHOLD_SEK,
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
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ year: 2027, quarter: 4, componentId: 'c1' });
    expect(items.find((i) => i.componentId === 'c1')?.estimatedCost).toBe(100_000);
    expect(items.find((i) => i.componentId === 'c1')?.costSource).toBe('unit_price');
    expect(items.find((i) => i.componentId === 'c2')).toBeUndefined();
    expect(items.find((i) => i.componentId === 'c3')).toBeUndefined();
    expect(items.find((i) => i.componentId === 'c4')).toBeUndefined();
  });

  it('earliest plan quarter is now + 5 (Q3 2026 → Q4 2027)', () => {
    expect(earliestPlanQuarter(new Date('2026-08-15'))).toEqual({
      year: 2027,
      quarter: 4,
    });
    expect(costRoutesToPlan(40_000)).toBe(false);
    expect(costRoutesToPlan(PLAN_COST_THRESHOLD_SEK)).toBe(true);
    expect(costRoutesToPlan(null)).toBe(true);
  });

  it('keeps a 40 tkr high-risk item off the plan (WO path)', () => {
    const items = generateMaintenancePlanItems(
      [
        risk({
          componentId: 'cheap',
          propertyId: 'p1',
          riskLevel: 'high',
          riskScore: 70,
          remainingB10Years: 1,
          confidence: 'medium',
        }),
      ],
      {
        startYear: 2027,
        startQuarter: 4,
        asOf: new Date('2026-08-15'),
        purchaseCosts: { cheap: 40_000 },
      },
    );
    expect(items).toHaveLength(0);
  });

  it('bundles cheap same-quarter items onto the plan when they sum over 75 tkr', () => {
    const items = generateMaintenancePlanItems(
      [
        risk({
          componentId: 'a',
          propertyId: 'p1',
          riskLevel: 'high',
          riskScore: 70,
          remainingB10Years: 2,
          confidence: 'medium',
        }),
        risk({
          componentId: 'b',
          propertyId: 'p1',
          riskLevel: 'high',
          riskScore: 65,
          remainingB10Years: 2,
          confidence: 'medium',
        }),
        risk({
          componentId: 'c',
          propertyId: 'p1',
          riskLevel: 'high',
          riskScore: 60,
          remainingB10Years: 2,
          confidence: 'medium',
        }),
      ],
      {
        startYear: 2027,
        startQuarter: 4,
        asOf: new Date('2026-08-15'),
        purchaseCosts: { a: 30_000, b: 30_000, c: 25_000 },
      },
    );
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.year === 2028 && i.quarter === 3)).toBe(true);
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
    expect(sum.itemCount).toBe(1);
    expect(sum.totalEstimatedCost).toBe(100_000);
  });
});
