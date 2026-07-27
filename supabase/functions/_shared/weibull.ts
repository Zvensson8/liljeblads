/** AUTO-GENERATED from src/lib — do not edit. Run: npm run sync:edge-risk */
/**
 * Weibull reliability utilities for component risk / remaining useful life.
 *
 * CDF: F(t) = 1 - exp(-(t/η)^β)
 * Reliability R(t) = exp(-(t/η)^β)
 * Hazard h(t) = (β/η) * (t/η)^(β-1)
 *
 * Pure TypeScript – no external stats dependencies.
 *
 * CANONICAL SOURCE for edge: run `npm run sync:edge-risk` after changes.
 * Do not edit supabase/functions/_shared/weibull.ts by hand.
 */

export interface WeibullParams {
  /** Shape parameter β. β < 1 infant mortality, β ≈ 1 random, β > 1 wear-out */
  shape: number;
  /** Scale / characteristic life η (same unit as t, usually years) */
  scale: number;
}

export interface WeibullFitResult extends WeibullParams {
  /** Number of failure (or inter-event) observations used */
  n: number;
  /** Method used for the fit */
  method: 'mle' | 'rank-regression' | 'prior' | 'hybrid';
}

const EPS = 1e-12;

/** Reliability R(t) = P(T > t) */
export function reliability(t: number, params: WeibullParams): number {
  if (t <= 0) return 1;
  if (params.scale <= 0 || params.shape <= 0) return 0;
  const ratio = t / params.scale;
  return Math.exp(-Math.pow(ratio, params.shape));
}

/** Cumulative failure probability F(t) = 1 - R(t) */
export function failureProbability(t: number, params: WeibullParams): number {
  return 1 - reliability(t, params);
}

/** Instantaneous hazard / failure rate h(t) */
export function hazardRate(t: number, params: WeibullParams): number {
  if (t <= 0 || params.scale <= 0 || params.shape <= 0) return 0;
  const ratio = t / params.scale;
  return (params.shape / params.scale) * Math.pow(ratio, params.shape - 1);
}

/**
 * Quantile life: time at which cumulative failure probability reaches p.
 * B10 life = quantileLife(0.10, params)
 * Median life = quantileLife(0.50, params)
 */
export function quantileLife(p: number, params: WeibullParams): number {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  if (params.scale <= 0 || params.shape <= 0) return 0;
  return params.scale * Math.pow(-Math.log(1 - p), 1 / params.shape);
}

/** Mean time to failure (MTTF) for Weibull */
export function meanLife(params: WeibullParams): number {
  if (params.scale <= 0 || params.shape <= 0) return 0;
  // Γ(1 + 1/β) approximated via Lanczos for common β range
  return params.scale * gamma(1 + 1 / params.shape);
}

/** Simple Lanczos approximation of the gamma function (good for x > 0.5) */
function gamma(z: number): number {
  // Reflection for small z
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  }
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.984369654078861e-6, 1.5056327351493116e-7,
  ];
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

/**
 * Rank-regression fit on complete failure times (least-squares on
 * linearised Weibull: ln(-ln(1-F)) = β·ln(t) - β·ln(η)).
 * Uses median rank plotting positions.
 */
export function fitWeibullRankRegression(times: number[]): WeibullFitResult | null {
  const sorted = times.filter((t) => t > 0).sort((a, b) => a - b);
  const n = sorted.length;
  if (n < 3) return null;

  // Median ranks: F_i ≈ (i - 0.3) / (n + 0.4)
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const F = (i + 1 - 0.3) / (n + 0.4);
    const y = Math.log(-Math.log(1 - Math.min(F, 1 - EPS)));
    const x = Math.log(sorted[i]);
    xs.push(x);
    ys.push(y);
  }

  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let ssxx = 0;
  let ssxy = 0;
  for (let i = 0; i < n; i++) {
    ssxx += (xs[i] - meanX) ** 2;
    ssxy += (xs[i] - meanX) * (ys[i] - meanY);
  }
  if (ssxx < EPS) return null;

  const beta = ssxy / ssxx;
  if (beta <= 0.05) return null; // pathological

  const intercept = meanY - beta * meanX; // = -β ln(η)
  const eta = Math.exp(-intercept / beta);

  return {
    shape: clamp(beta, 0.3, 8),
    scale: Math.max(eta, 0.1),
    n,
    method: 'rank-regression',
  };
}

/**
 * Simple 1-D search MLE for shape, closed-form scale given shape.
 * Good enough for n ≈ 5–50.
 */
export function fitWeibullMLE(times: number[]): WeibullFitResult | null {
  const data = times.filter((t) => t > 0);
  const n = data.length;
  if (n < 3) return null;

  const logSum = data.reduce((s, t) => s + Math.log(t), 0);

  // Golden-section search on β ∈ [0.3, 8]
  let lo = 0.3;
  let hi = 8;
  const phi = (1 + Math.sqrt(5)) / 2;
  for (let iter = 0; iter < 40; iter++) {
    const c = hi - (hi - lo) / phi;
    const d = lo + (hi - lo) / phi;
    if (negLogLik(data, c, logSum, n) < negLogLik(data, d, logSum, n)) {
      hi = d;
    } else {
      lo = c;
    }
  }
  const beta = (lo + hi) / 2;
  const eta = scaleGivenShape(data, beta);

  return {
    shape: clamp(beta, 0.3, 8),
    scale: Math.max(eta, 0.1),
    n,
    method: 'mle',
  };
}

function scaleGivenShape(data: number[], beta: number): number {
  const sum = data.reduce((s, t) => s + Math.pow(t, beta), 0);
  return Math.pow(sum / data.length, 1 / beta);
}

function negLogLik(data: number[], beta: number, logSum: number, n: number): number {
  const eta = scaleGivenShape(data, beta);
  if (eta <= 0) return 1e30;
  // -ℓ = -n ln β + n β ln η - (β-1) Σ ln t + Σ (t/η)^β
  let sumPow = 0;
  for (const t of data) sumPow += Math.pow(t / eta, beta);
  return -n * Math.log(beta) + n * beta * Math.log(eta) - (beta - 1) * logSum + sumPow;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Build parameters from a prior characteristic life (expected lifespan)
 * and an observed acute-event intensity.
 *
 * Higher acute rate → higher shape (more wear-out / accelerating failures).
 */
export function paramsFromPrior(
  expectedLifespanYears: number,
  ageYears: number,
  acuteCount: number,
  defaultShape = 2.2,
): WeibullFitResult {
  const eta = Math.max(expectedLifespanYears, 1);
  // Intensity of acute events per year of life so far
  const intensity = ageYears > 0.25 ? acuteCount / ageYears : acuteCount;
  // Mild adjustment: more acutes → slightly higher β (wear-out)
  const shape = clamp(defaultShape + intensity * 0.4, 0.8, 5);
  return {
    shape,
    scale: eta,
    n: acuteCount,
    method: 'prior',
  };
}
