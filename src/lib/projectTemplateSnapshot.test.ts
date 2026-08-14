import { describe, expect, it } from 'vitest';
import {
  durationQuartersFromProject,
  mapProjectTypeToTemplateType,
  snapshotProjectAsTemplate,
} from './projectTemplateSnapshot';

describe('projectTemplateSnapshot', () => {
  it('maps Swedish and English project types', () => {
    expect(mapProjectTypeToTemplateType('underhåll')).toBe('underhall');
    expect(mapProjectTypeToTemplateType('investment')).toBe('investering');
    expect(mapProjectTypeToTemplateType('okänt')).toBe('annat');
  });

  it('counts inclusive quarters', () => {
    expect(
      durationQuartersFromProject({ start_quarter: 2, end_quarter: 4 }),
    ).toBe(3);
    expect(durationQuartersFromProject({})).toBeNull();
  });

  it('copies structure, not people or property', () => {
    const snap = snapshotProjectAsTemplate(
      {
        name: 'Fasad Hjulet',
        description: 'Puts och målning',
        type: 'underhall',
        budget: 500000,
        start_quarter: 1,
        end_quarter: 2,
      },
      [
        { title: 'Besiktning', description: 'Yttre', order_index: 1 },
        { title: '  ', description: 'skip', order_index: 0 },
        { title: 'Offert', description: null, order_index: 0 },
      ],
      [
        { category: 'Material', amount: 200000 },
        { category: 'Material', amount: 50000 },
        { category: null, amount: 10000 },
      ],
    );

    expect(snap.checklist_items.map((i) => i.title)).toEqual([
      'Offert',
      'Besiktning',
    ]);
    expect(snap.budget_categories).toEqual([
      { name: 'Material', estimated_amount: 250000 },
      { name: 'Övrigt', estimated_amount: 10000 },
    ]);
    expect(snap.estimated_duration_quarters).toBe(2);
    expect(snap).not.toHaveProperty('property_id');
  });
});
