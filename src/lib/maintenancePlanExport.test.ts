import { describe, expect, it } from 'vitest';
import { buildExportPeriod, type MaintenancePlanExportMeta } from './maintenancePlanExport';

describe('maintenancePlanExport', () => {
  it('builds period label with property count', () => {
    const meta: MaintenancePlanExportMeta = {
      startYear: 2027,
      startQuarter: 2,
      horizonYears: 5,
      propertyCount: 3,
      totalCost: 100_000,
      itemCount: 12,
    };
    const label = buildExportPeriod(meta);
    expect(label).toContain('2027');
    expect(label).toMatch(/Q2/);
    expect(label).toContain('3 fastigheter');
  });
});
