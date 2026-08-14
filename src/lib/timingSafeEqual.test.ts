import { describe, expect, it } from 'vitest';
import { timingSafeEqual } from './timingSafeEqual';

describe('timingSafeEqual', () => {
  it('matches identical secrets', () => {
    expect(timingSafeEqual('cron-secret-16xx', 'cron-secret-16xx')).toBe(true);
  });

  it('rejects different values and lengths', () => {
    expect(timingSafeEqual('aaaa', 'aaab')).toBe(false);
    expect(timingSafeEqual('short', 'longer-value')).toBe(false);
    expect(timingSafeEqual('', 'x')).toBe(false);
  });
});
