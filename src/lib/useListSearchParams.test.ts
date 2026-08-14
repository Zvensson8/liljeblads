import { describe, expect, it } from 'vitest';

/** Pure helper mirrored from useListSearchParams URL rules. */
function applyParam(
  current: URLSearchParams,
  key: string,
  value: string,
  fallback: string,
): string {
  const next = new URLSearchParams(current);
  if (!value || value === fallback) next.delete(key);
  else next.set(key, value);
  return next.toString();
}

describe('list search params', () => {
  it('omits default and empty values', () => {
    const q = new URLSearchParams('tab=active');
    expect(applyParam(q, 'status', 'all', 'all')).toBe('tab=active');
    expect(applyParam(q, 'q', 'hjulet', '')).toBe('tab=active&q=hjulet');
    expect(applyParam(new URLSearchParams('q=hjulet'), 'q', '', '')).toBe('');
  });
});
