/**
 * Component risk scoring based on Weibull reliability analysis.
 *
 * Data sources (existing schema):
 * - components.installation_year
 * - component_purchase_info.expected_lifespan_years / purchase_date
 * - maintenance_history (category = 'acute' treated as failure-like events)
 *
 * Strategy (hybrid, works with sparse data):
 * 1. If ≥ 3 inter-acute intervals exist → fit Weibull (MLE preferred, rank-regression fallback).
 * 2. Else use expected_lifespan (or type default) as scale η and adjust shape from acute intensity.
 * 3. Evaluate R(t), F(t), hazard, B10/median, risk score 0–100 at current age.
 */

import {
  failureProbability,
  fitWeibullMLE,
  fitWeibullRankRegression,
  hazardRate,
  paramsFromPrior,
  quantileLife,
  reliability,
  type WeibullFitResult,
  type WeibullParams,
} from '@/lib/weibull';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type Confidence = 'low' | 'medium' | 'high';

export interface ComponentRiskInput {
  componentId: string;
  name?: string;
  type?: string | null;
  installationYear: number | null;
  purchaseDate: string | null; // ISO date
  expectedLifespanYears: number | null;
  /** All maintenance rows for this component (or at least acute + dates) */
  history: Array<{
    performed_date: string;
    category: string | null;
  }>;
  /** Optional override for "now" (tests) */
  asOf?: Date;
}

export interface ComponentRiskResult {
  componentId: string;
  ageYears: number;
  params: WeibullFitResult;
  reliability: number;
  failureProbability: number;
  hazardRate: number;
  /** Years until cumulative failure probability reaches 10 % from now (approx) */
  remainingB10Years: number | null;
  medianLifeYears: number | null;
  riskScore: number; // 0–100, higher = worse
  riskLevel: RiskLevel;
  confidence: Confidence;
  acuteCount: number;
  recommendation: string;
}

/** Default characteristic lives (years) by coarse component family when no purchase info exists. */
const TYPE_DEFAULT_LIFESPAN: Record<string, number> = {
  // Heat / cooling / ventilation – typical commercial values
  SC1: 20,
  'SC2.1.1': 18,
  'SC2.3': 15,
  'SC2.3.1': 15,
  'SC2.3.3': 12,
  'SC2.3.4': 15,
  'SC2.3.7': 12,
  'SC2.6.2': 15,
  'SC4.1.2.5.1': 20,
  'SC4.1.2.5.3': 18,
  'SC4.1.6.9': 15,
  'SC4.2.4.6': 12,
  'SC4.2.4.7': 12,
  'SC4.5.1': 15,
  'SC4.6.2.6': 15,
  'SC4.6.2.6.1': 15,
  'SC4.7': 20,
  SC5.5: 15,
  'SC7.1': 12,
  'SC7.2': 12,
};

const DEFAULT_LIFESPAN = 15;

function yearsBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / (365.25 * 24 * 3600 * 1000));
}

function resolveInstallDate(input: ComponentRiskInput): Date | null {
  if (input.purchaseDate) {
    const d = new Date(input.purchaseDate);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (input.installationYear && input.installationYear > 1970) {
    return new Date(Date.UTC(input.installationYear, 0, 1));
  }
  return null;
}

function interEventTimes(dates: string[]): number[] {
  const sorted = dates
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const y = yearsBetween(sorted[i - 1], sorted[i]);
    if (y > 0.01) intervals.push(y);
  }
  return intervals;
}

function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 75) return 'critical';
  if (score >= 55) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

function buildRecommendation(
  level: RiskLevel,
  age: number,
  remainingB10: number | null,
  acuteCount: number,
): string {
  if (level === 'critical') {
    return 'Hög prioritet: planera utbyte eller större service inom kort. Risken för akut fel är förhöjd.';
  }
  if (level === 'high') {
    const when =
      remainingB10 != null && remainingB10 < 3
        ? `B10-återstående livslängd ≈ ${remainingB10.toFixed(1)} år.`
        : `Komponenten är ${age.toFixed(1)} år gammal.`;
    return `Förhöjd risk. ${when} Överväg förebyggande åtgärd eller tätare kontroll.`;
  }
  if (level === 'medium') {
    return acuteCount > 0
      ? 'Måttlig risk. Tidigare akuta händelser finns – följ upp intervall och tillstånd.'
      : 'Måttlig risk utifrån ålder/livslängd. Fortsätt planerat underhåll.';
  }
  return 'Låg risk utifrån nuvarande data. Behåll ordinarie serviceplan.';
}

/**
 * Compute Weibull-based risk for a single component.
 */
export function computeComponentRisk(input: ComponentRiskInput): ComponentRiskResult {
  const now = input.asOf ?? new Date();
  const install = resolveInstallDate(input);
  const ageYears = install ? yearsBetween(install, now) : 0;

  const acuteDates = input.history
    .filter((h) => h.category === 'acute')
    .map((h) => h.performed_date);

  const acuteCount = acuteDates.length;
  const intervals = interEventTimes(acuteDates);

  const priorLife =
    input.expectedLifespanYears && input.expectedLifespanYears > 0
      ? input.expectedLifespanYears
      : TYPE_DEFAULT_LIFESPAN[input.type ?? ''] ?? DEFAULT_LIFESPAN;

  let params: WeibullFitResult;
  let confidence: Confidence;

  if (intervals.length >= 5) {
    params =
      fitWeibullMLE(intervals) ??
      fitWeibullRankRegression(intervals) ??
      paramsFromPrior(priorLife, ageYears, acuteCount);
    confidence = 'high';
  } else if (intervals.length >= 3) {
    params =
      fitWeibullRankRegression(intervals) ??
      fitWeibullMLE(intervals) ??
      paramsFromPrior(priorLife, ageYears, acuteCount);
    confidence = 'medium';
  } else {
    // Sparse data – hybrid prior
    params = paramsFromPrior(priorLife, ageYears || 1, acuteCount);
    // If we have age but no acute data, confidence is still usable via prior
    confidence = ageYears > 1 || acuteCount > 0 ? 'medium' : 'low';
    if (intervals.length > 0) {
      // Blend: pull scale slightly toward observed mean interval
      const meanInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
      params = {
        ...params,
        scale: 0.6 * params.scale + 0.4 * meanInterval,
        method: 'hybrid',
        n: intervals.length,
      };
    }
  }

  // Guard: if age is unknown, use a conservative mid-life assumption for scoring only
  const t = ageYears > 0 ? ageYears : priorLife * 0.4;

  const R = reliability(t, params);
  const F = failureProbability(t, params);
  const h = hazardRate(t, params);
  const median = quantileLife(0.5, params);
  const b10 = quantileLife(0.1, params);

  // Remaining B10 ≈ max(0, B10_total - age)
  const remainingB10 =
    ageYears > 0 && Number.isFinite(b10) ? Math.max(0, b10 - ageYears) : null;

  // Risk score 0–100
  // - Base from cumulative failure probability (weighted heavily)
  // - Bonus from hazard and recent acute intensity
  // - Bonus when remaining B10 is short
  let score = F * 70;
  score += Math.min(h * 8, 15); // hazard contribution capped
  if (remainingB10 != null) {
    if (remainingB10 < 1) score += 15;
    else if (remainingB10 < 3) score += 8;
    else if (remainingB10 < 5) score += 3;
  }
  // Acute intensity penalty
  if (ageYears > 0.5) {
    const intensity = acuteCount / ageYears;
    score += Math.min(intensity * 12, 12);
  }
  score = Math.round(Math.min(100, Math.max(0, score)));

  const level = riskLevelFromScore(score);

  return {
    componentId: input.componentId,
    ageYears: Math.round(ageYears * 100) / 100,
    params,
    reliability: Math.round(R * 1000) / 1000,
    failureProbability: Math.round(F * 1000) / 1000,
    hazardRate: Math.round(h * 1000) / 1000,
    remainingB10Years:
      remainingB10 != null ? Math.round(remainingB10 * 100) / 100 : null,
    medianLifeYears: Number.isFinite(median) ? Math.round(median * 100) / 100 : null,
    riskScore: score,
    riskLevel: level,
    confidence,
    acuteCount,
    recommendation: buildRecommendation(level, ageYears, remainingB10, acuteCount),
  };
}

/** Batch helper – compute risk for many components */
export function computeComponentRiskBatch(
  inputs: ComponentRiskInput[],
): ComponentRiskResult[] {
  return inputs
    .map(computeComponentRisk)
    .sort((a, b) => b.riskScore - a.riskScore);
}

export function riskLevelLabel(level: RiskLevel): string {
  switch (level) {
    case 'critical':
      return 'Kritisk';
    case 'high':
      return 'Hög';
    case 'medium':
      return 'Medel';
    case 'low':
      return 'Låg';
  }
}

export function riskLevelColor(level: RiskLevel): string {
  switch (level) {
    case 'critical':
      return 'bg-red-600 text-white';
    case 'high':
      return 'bg-orange-500 text-white';
    case 'medium':
      return 'bg-amber-400 text-black';
    case 'low':
      return 'bg-emerald-500 text-white';
  }
}
