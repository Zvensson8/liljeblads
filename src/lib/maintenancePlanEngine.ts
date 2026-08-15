/**
 * Predictive maintenance plan engine.
 *
 * Maps component Weibull risk → year + quarter actions within a
 * user-selected start quarter and multi-year horizon (default 5 years).
 * Only components with sufficient risk are included.
 */

import {
  confidenceMeetsMin,
  riskLevelMeetsMin,
  type ComponentRiskResult,
  type Confidence,
  type RiskLevel,
} from '@/lib/componentRisk';

export type Quarter = 1 | 2 | 3 | 4;

export type PlanActionType = 'replace' | 'overhaul' | 'service' | 'inspect';
export type PlanCostSource = 'purchase_info' | 'unit_price' | 'manual';

/** Weibull ≥ this → underhållsplan. Below → arbetsorder. Missing cost → plan. */
export const PLAN_COST_THRESHOLD_SEK = 75_000;

/** Q3 2026 → earliest plan slot Q4 2027. */
export const PLAN_LEAD_QUARTERS = 5;

export interface PlanGenerateOptions {
  startYear: number;
  startQuarter: Quarter;
  horizonYears?: number;
  minRiskLevel?: RiskLevel;
  minConfidence?: Confidence;
  asOf?: Date;
  /** component_type → replacement cost (áprislista) */
  unitPricesByType?: Map<string, number> | Record<string, number>;
  /** component_id → purchase_cost */
  purchaseCosts?: Map<string, number> | Record<string, number>;
  /** Soft cap items per quarter before sliding lower-risk items forward */
  maxItemsPerQuarter?: number;
}

export interface PlanItemDraft {
  componentId: string;
  componentName?: string;
  componentType?: string | null;
  year: number;
  quarter: Quarter;
  actionType: PlanActionType;
  title: string;
  riskLevel: RiskLevel;
  riskScore: number;
  remainingB10Years: number | null;
  confidence: Confidence;
  estimatedCost: number | null;
  costSource: PlanCostSource | null;
  sortOrder: number;
}

export interface PlanPeriod {
  startYear: number;
  startQuarter: Quarter;
  endYear: number;
  endQuarter: Quarter;
  horizonYears: number;
  totalQuarters: number;
}

export interface PlanSummary {
  itemCount: number;
  totalEstimatedCost: number | null;
  costKnownCount: number;
  byYear: Record<number, { count: number; cost: number | null }>;
  period: PlanPeriod;
}

// ── Quarter helpers ──────────────────────────────────────────────

export function dateToYearQuarter(d: Date): { year: number; quarter: Quarter } {
  const month = d.getMonth(); // 0–11
  const quarter = (Math.floor(month / 3) + 1) as Quarter;
  return { year: d.getFullYear(), quarter };
}

/** Absolute quarter index (year*4 + quarter-1) for comparisons */
export function yearQuarterIndex(year: number, quarter: Quarter): number {
  return year * 4 + (quarter - 1);
}

export function indexToYearQuarter(index: number): { year: number; quarter: Quarter } {
  const year = Math.floor(index / 4);
  const quarter = ((index % 4) + 1) as Quarter;
  return { year, quarter };
}

export function addQuarters(
  year: number,
  quarter: Quarter,
  n: number,
): { year: number; quarter: Quarter } {
  return indexToYearQuarter(yearQuarterIndex(year, quarter) + n);
}

export function nextCalendarQuarter(asOf: Date = new Date()): {
  year: number;
  quarter: Quarter;
} {
  const { year, quarter } = dateToYearQuarter(asOf);
  return addQuarters(year, quarter, 1);
}

export function earliestPlanQuarter(asOf: Date = new Date()): {
  year: number;
  quarter: Quarter;
} {
  const { year, quarter } = dateToYearQuarter(asOf);
  return addQuarters(year, quarter, PLAN_LEAD_QUARTERS);
}

/** Missing estimate is treated as plan (do not silently create a WO). */
export function costRoutesToPlan(cost: number | null | undefined): boolean {
  if (cost == null || !Number.isFinite(cost)) return true;
  return cost >= PLAN_COST_THRESHOLD_SEK;
}

export function computePlanPeriod(
  startYear: number,
  startQuarter: Quarter,
  horizonYears: number,
): PlanPeriod {
  const totalQuarters = horizonYears * 4;
  // Inclusive horizon: start + (totalQuarters - 1)
  const end = addQuarters(startYear, startQuarter, totalQuarters - 1);
  return {
    startYear,
    startQuarter,
    endYear: end.year,
    endQuarter: end.quarter,
    horizonYears,
    totalQuarters,
  };
}

export function formatYearQuarter(year: number, quarter: number): string {
  return `Q${quarter} ${year}`;
}

export function formatPlanPeriod(period: PlanPeriod): string {
  return `${formatYearQuarter(period.startYear, period.startQuarter)} – ${formatYearQuarter(period.endYear, period.endQuarter)}`;
}

// ── Cost resolve ─────────────────────────────────────────────────

function mapGet(
  map: Map<string, number> | Record<string, number> | undefined,
  key: string,
): number | undefined {
  if (!map) return undefined;
  if (map instanceof Map) return map.get(key);
  return map[key];
}

/** Case-insensitive + trimmed lookup for unit price maps */
function mapGetLoose(
  map: Map<string, number> | Record<string, number> | undefined,
  key: string,
): number | undefined {
  if (!map) return undefined;
  const direct = mapGet(map, key);
  if (direct != null) return direct;
  const lower = key.toLowerCase();
  if (map instanceof Map) {
    for (const [k, v] of map) {
      if (k.trim().toLowerCase() === lower) return v;
    }
    return undefined;
  }
  for (const k of Object.keys(map)) {
    if (k.trim().toLowerCase() === lower) return map[k];
  }
  return undefined;
}

export function resolveEstimatedCost(
  componentId: string,
  componentType: string | null | undefined,
  opts: Pick<PlanGenerateOptions, 'unitPricesByType' | 'purchaseCosts'>,
): { cost: number | null; source: PlanCostSource | null } {
  const typeKey = componentType?.trim();
  if (typeKey) {
    const unit = mapGetLoose(opts.unitPricesByType, typeKey);
    if (unit != null && Number.isFinite(unit) && unit >= 0) {
      return { cost: unit, source: 'unit_price' };
    }
  }
  const purchase = mapGet(opts.purchaseCosts, componentId);
  if (purchase != null && Number.isFinite(purchase) && purchase >= 0) {
    return { cost: purchase, source: 'purchase_info' };
  }
  return { cost: null, source: null };
}

// ── Action type ──────────────────────────────────────────────────

export function inferActionType(risk: ComponentRiskResult): PlanActionType {
  const rec = (risk.recommendation || '').toLowerCase();
  const b10 = risk.remainingB10Years;

  if (
    risk.riskLevel === 'critical' ||
    (b10 != null && b10 < 1) ||
    rec.includes('byt') ||
    rec.includes('ersätt') ||
    rec.includes('replace')
  ) {
    return 'replace';
  }
  if (risk.riskLevel === 'high' && (b10 == null || b10 < 3)) {
    return 'overhaul';
  }
  if (rec.includes('inspe') || rec.includes('kontroll')) {
    return 'inspect';
  }
  return 'service';
}

export function actionTypeLabel(t: PlanActionType): string {
  switch (t) {
    case 'replace':
      return 'Byte';
    case 'overhaul':
      return 'Renovering';
    case 'inspect':
      return 'Inspektion';
    case 'service':
      return 'Service';
  }
}

function buildTitle(risk: ComponentRiskResult, action: PlanActionType): string {
  const name = risk.name || 'Komponent';
  const prefix = actionTypeLabel(action);
  if (risk.recommendation && risk.recommendation.length <= 120) {
    return `${prefix}: ${name} — ${risk.recommendation}`;
  }
  return `${prefix}: ${name}`;
}

// ── Urgency → target date ────────────────────────────────────────

function urgencyYears(risk: ComponentRiskResult): number {
  const b10 = risk.remainingB10Years;
  switch (risk.riskLevel) {
    case 'critical':
      return Math.min(b10 ?? 0, 0.25);
    case 'high':
      return b10 ?? 1;
    case 'medium':
      return b10 ?? 3;
    case 'low':
    default:
      return b10 ?? 10;
  }
}

function addYearsToDate(d: Date, years: number): Date {
  const out = new Date(d.getTime());
  const months = Math.round(years * 12);
  out.setMonth(out.getMonth() + months);
  return out;
}

// ── Core generator ───────────────────────────────────────────────

export function generateMaintenancePlanItems(
  risks: ComponentRiskResult[],
  opts: PlanGenerateOptions,
): PlanItemDraft[] {
  const horizonYears = opts.horizonYears ?? 5;
  const minRisk = opts.minRiskLevel ?? 'high';
  const minConf = opts.minConfidence ?? 'medium';
  const asOf = opts.asOf ?? new Date();
  const maxPerQ = opts.maxItemsPerQuarter ?? 12;
  const period = computePlanPeriod(opts.startYear, opts.startQuarter, horizonYears);
  const startIdx = yearQuarterIndex(period.startYear, period.startQuarter);
  const endIdx = yearQuarterIndex(period.endYear, period.endQuarter);

  const earliest = earliestPlanQuarter(asOf);
  const earliestIdx = yearQuarterIndex(earliest.year, earliest.quarter);

  const candidates: Array<{
    risk: ComponentRiskResult;
    targetIdx: number;
    actionType: PlanActionType;
    cost: number | null;
    costSource: PlanCostSource | null;
  }> = [];

  for (const risk of risks) {
    if (!riskLevelMeetsMin(risk.riskLevel, minRisk)) continue;
    if (!confidenceMeetsMin(risk.confidence, minConf)) continue;
    // Never include low in v1 even if min is somehow lower
    if (risk.riskLevel === 'low') continue;

    // Medium: only if B10 within horizon (extra guard)
    if (risk.riskLevel === 'medium') {
      if (risk.remainingB10Years == null || risk.remainingB10Years > horizonYears) {
        continue;
      }
    }

    // Critical without B10 → start quarter
    let targetIdx: number;
    if (risk.riskLevel === 'critical' && risk.remainingB10Years == null) {
      targetIdx = startIdx;
    } else {
      const uy = urgencyYears(risk);
      const targetDate = addYearsToDate(asOf, uy);
      const tq = dateToYearQuarter(targetDate);
      targetIdx = yearQuarterIndex(tq.year, tq.quarter);
    }

    // Before plan start → clamp to start (overdue)
    if (targetIdx < startIdx) targetIdx = startIdx;
    // After plan end → exclude
    if (targetIdx > endIdx) continue;

    const { cost, source } = resolveEstimatedCost(risk.componentId, risk.type, opts);
    candidates.push({
      risk,
      targetIdx,
      actionType: inferActionType(risk),
      cost,
      costSource: source,
    });
  }

  // Cheap singles stay on the WO path unless the same property+quarter sums ≥ 75 tkr.
  const groupKey = (c: (typeof candidates)[number]) =>
    `${c.risk.propertyId ?? c.risk.componentId}:${c.targetIdx}`;
  const groupSum = new Map<string, { sum: number; unknown: boolean }>();
  for (const c of candidates) {
    const key = groupKey(c);
    const cur = groupSum.get(key) ?? { sum: 0, unknown: false };
    if (c.cost == null) cur.unknown = true;
    else cur.sum += c.cost;
    groupSum.set(key, cur);
  }

  const planCandidates = candidates.filter((c) => {
    const g = groupSum.get(groupKey(c));
    if (!g) return costRoutesToPlan(c.cost);
    if (g.unknown || g.sum >= PLAN_COST_THRESHOLD_SEK) return true;
    return costRoutesToPlan(c.cost);
  });

  for (const c of planCandidates) {
    if (c.targetIdx < earliestIdx) c.targetIdx = earliestIdx;
    if (c.targetIdx < startIdx) c.targetIdx = startIdx;
    if (c.targetIdx > endIdx) {
      c.targetIdx = -1;
    }
  }

  const placeable = planCandidates.filter((c) => c.targetIdx >= 0);

  // Highest risk first for placement priority
  placeable.sort((a, b) => {
    if (b.risk.riskScore !== a.risk.riskScore) {
      return b.risk.riskScore - a.risk.riskScore;
    }
    return a.targetIdx - b.targetIdx;
  });

  // Soft load-balance: slide lower-priority items forward if quarter full
  const countByIdx = new Map<number, number>();
  const placed: typeof placeable = [];

  for (const c of placeable) {
    let idx = c.targetIdx;
    while (idx <= endIdx) {
      const n = countByIdx.get(idx) ?? 0;
      if (n < maxPerQ) {
        countByIdx.set(idx, n + 1);
        placed.push({ ...c, targetIdx: idx });
        break;
      }
      idx += 1;
    }
    // If could not place within horizon after sliding, drop
  }

  // Chronological then risk
  placed.sort((a, b) => {
    if (a.targetIdx !== b.targetIdx) return a.targetIdx - b.targetIdx;
    return b.risk.riskScore - a.risk.riskScore;
  });

  return placed.map((c, i) => {
    const { year, quarter } = indexToYearQuarter(c.targetIdx);
    return {
      componentId: c.risk.componentId,
      componentName: c.risk.name,
      componentType: c.risk.type,
      year,
      quarter,
      actionType: c.actionType,
      title: buildTitle(c.risk, c.actionType),
      riskLevel: c.risk.riskLevel,
      riskScore: c.risk.riskScore,
      remainingB10Years: c.risk.remainingB10Years,
      confidence: c.risk.confidence,
      estimatedCost: c.cost,
      costSource: c.costSource,
      sortOrder: i,
    };
  });
}

export function summarizePlanItems(
  items: PlanItemDraft[],
  opts: Pick<PlanGenerateOptions, 'startYear' | 'startQuarter' | 'horizonYears'>,
): PlanSummary {
  const horizonYears = opts.horizonYears ?? 5;
  const period = computePlanPeriod(opts.startYear, opts.startQuarter, horizonYears);
  const byYear: PlanSummary['byYear'] = {};
  let total = 0;
  let known = 0;

  for (const item of items) {
    if (!byYear[item.year]) {
      byYear[item.year] = { count: 0, cost: null };
    }
    byYear[item.year].count += 1;
    if (item.estimatedCost != null) {
      known += 1;
      total += item.estimatedCost;
      byYear[item.year].cost = (byYear[item.year].cost ?? 0) + item.estimatedCost;
    }
  }

  return {
    itemCount: items.length,
    totalEstimatedCost: known > 0 ? total : null,
    costKnownCount: known,
    byYear,
    period,
  };
}

/** Group items by year then quarter for UI */
export function groupItemsByYearQuarter(
  items: Array<{ year: number; quarter: number } & Record<string, unknown>>,
): Map<number, Map<Quarter, typeof items>> {
  const map = new Map<number, Map<Quarter, typeof items>>();
  for (const item of items) {
    const q = item.quarter as Quarter;
    if (!map.has(item.year)) map.set(item.year, new Map());
    const yMap = map.get(item.year)!;
    if (!yMap.has(q)) yMap.set(q, []);
    yMap.get(q)!.push(item);
  }
  return map;
}
