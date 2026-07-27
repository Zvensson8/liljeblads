import { describe, expect, it } from 'vitest';
import {
  failureProbability,
  fitWeibullMLE,
  fitWeibullRankRegression,
  hazardRate,
  paramsFromPrior,
  quantileLife,
  reliability,
} from '@/lib/weibull';

const p = { shape: 2.2, scale: 15 };

describe('weibull', () => {
  it('R(0) = 1 and R large → ~0', () => {
    expect(reliability(0, p)).toBe(1);
    expect(reliability(1000, p)).toBeLessThan(0.01);
  });

  it('F(η) ≈ 1 - 1/e ≈ 0.632', () => {
    const f = failureProbability(15, p);
    expect(f).toBeGreaterThan(0.5);
    expect(f).toBeLessThan(0.7);
  });

  it('B10 life is positive and less than scale', () => {
    const b10 = quantileLife(0.1, p);
    expect(b10).toBeGreaterThan(0);
    expect(b10).toBeLessThan(15);
  });

  it('hazard is 0 at t=0 for β>1', () => {
    expect(hazardRate(0, p)).toBe(0);
    expect(hazardRate(10, p)).toBeGreaterThan(0);
  });

  it('MLE returns null for n < 3', () => {
    expect(fitWeibullMLE([1, 2])).toBeNull();
  });

  it('MLE fits reasonable shape/scale', () => {
    const fit = fitWeibullMLE([2, 3, 4, 5, 6, 7, 8]);
    expect(fit).not.toBeNull();
    expect(fit!.shape).toBeGreaterThan(0.3);
    expect(fit!.scale).toBeGreaterThan(0);
    expect(fit!.method).toBe('mle');
  });

  it('rank regression returns null for n < 3', () => {
    expect(fitWeibullRankRegression([1, 2])).toBeNull();
  });

  it('paramsFromPrior uses expected life as scale', () => {
    const prior = paramsFromPrior(20, 10, 3);
    expect(prior.method).toBe('prior');
    expect(prior.scale).toBe(20);
    expect(prior.shape).toBeGreaterThan(0);
  });
});
