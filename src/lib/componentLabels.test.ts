import { describe, expect, it } from 'vitest';
import { componentStatusLabel } from './componentLabels';

describe('componentStatusLabel', () => {
  it('returns Swedish labels', () => {
    expect(componentStatusLabel('active')).toBe('Aktiv');
    expect(componentStatusLabel('maintenance')).toBe('Underhåll');
    expect(componentStatusLabel('inactive')).toBe('Inaktiv');
    expect(componentStatusLabel('decommissioned')).toBe('Avställd');
  });
});
