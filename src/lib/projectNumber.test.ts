import { describe, expect, it } from 'vitest';
import { normalizeProjectNumber } from './projectNumber';

describe('normalizeProjectNumber', () => {
  it('accepts a suffix only', () => {
    expect(normalizeProjectNumber('+14', 'Hjulet 1')).toEqual({
      ok: true,
      value: 'Hjulet 1+14',
    });
    expect(normalizeProjectNumber('-02', 'Hjulet 1')).toEqual({
      ok: true,
      value: 'Hjulet 1-02',
    });
  });

  it('accepts a full number with the property stem', () => {
    expect(normalizeProjectNumber('Hjulet 1+14', 'Hjulet 1')).toEqual({
      ok: true,
      value: 'Hjulet 1+14',
    });
  });

  it('rejects a number without +xx/-xx', () => {
    const out = normalizeProjectNumber('Hjulet 1', 'Hjulet 1');
    expect(out.ok).toBe(false);
  });

  it('rejects a different property stem', () => {
    const out = normalizeProjectNumber('Orrby 1+3', 'Hjulet 1');
    expect(out.ok).toBe(false);
  });

  it('rejects a missing property number', () => {
    const out = normalizeProjectNumber('+14', null);
    expect(out.ok).toBe(false);
  });
});
