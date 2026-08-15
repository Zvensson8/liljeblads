import { describe, expect, it } from 'vitest';
import { planWeibullMerge, type ExistingPlanItem } from './mergeWeibullPlan';
import type { PlanItemDraft } from './maintenancePlanEngine';

const draft = (id: string): PlanItemDraft => ({
  componentId: id,
  componentName: id,
  componentType: 'SC4.7',
  year: 2027,
  quarter: 4,
  actionType: 'replace',
  title: `Byte ${id}`,
  riskLevel: 'high',
  riskScore: 70,
  remainingB10Years: 4.6,
  confidence: 'medium',
  estimatedCost: 180_000,
  costSource: 'unit_price',
  sortOrder: 0,
});

describe('planWeibullMerge', () => {
  it('inserts new Weibull drafts', () => {
    const out = planWeibullMerge([], [draft('c1')]);
    expect(out).toEqual([{ kind: 'insert', draft: expect.objectContaining({ componentId: 'c1' }) }]);
  });

  it('updates untouched planned Weibull rows', () => {
    const existing: ExistingPlanItem[] = [
      { id: 'row1', component_id: 'c1', source: 'weibull', status: 'planned', user_edited: false },
    ];
    const out = planWeibullMerge(existing, [draft('c1')]);
    expect(out[0]).toMatchObject({ kind: 'update', id: 'row1' });
  });

  it('does not overwrite edited or skipped rows', () => {
    const existing: ExistingPlanItem[] = [
      { id: 'e', component_id: 'c1', source: 'weibull', status: 'planned', user_edited: true },
      { id: 's', component_id: 'c2', source: 'weibull', status: 'skipped', user_edited: true },
    ];
    const out = planWeibullMerge(existing, [draft('c1'), draft('c2')]);
    expect(out.map((d) => d.kind)).toEqual(['skip', 'skip']);
  });

  it('does not replace a manual or EnergyPulse row on the same component', () => {
    const existing: ExistingPlanItem[] = [
      { id: 'm', component_id: 'c1', source: 'manual', status: 'planned', user_edited: true },
    ];
    const out = planWeibullMerge(existing, [draft('c1')]);
    expect(out[0]).toEqual({ kind: 'skip', reason: 'not-weibull' });
  });
});
