/**
 * Smoke tests for Weibull risk + maintenance plan engine (no DB).
 * Run: node scripts/smoke-predictive-maintenance.mjs
 * or:  npx tsx scripts/smoke-predictive-maintenance.ts
 */

import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Use tsx dynamic import of TS modules
const weibull = await import(pathToFileURL(path.join(root, 'src/lib/weibull.ts')).href);
const risk = await import(pathToFileURL(path.join(root, 'src/lib/componentRisk.ts')).href);
const plan = await import(pathToFileURL(path.join(root, 'src/lib/maintenancePlanEngine.ts')).href);
const policy = await import(pathToFileURL(path.join(root, 'src/lib/agentPolicy.ts')).href);

const results = [];
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
    throw new Error(msg);
  }
  results.push('OK: ' + msg);
  console.log('OK:', msg);
}

const {
  reliability,
  failureProbability,
  quantileLife,
  fitWeibullMLE,
  paramsFromPrior,
} = weibull;
const {
  computeComponentRisk,
  computeComponentRiskBatch,
  filterRiskResults,
} = risk;
const {
  generateMaintenancePlanItems,
  summarizePlanItems,
  formatPlanPeriod,
  resolveEstimatedCost,
  nextCalendarQuarter,
  computePlanPeriod,
} = plan;
const { applyPolicyToRisks, normalizePolicy, DEFAULT_AGENT_POLICY } = policy;

// --- Weibull math ---
const p = { shape: 2.2, scale: 15 };
assert(Math.abs(reliability(0, p) - 1) < 1e-9, 'R(0)=1');
const Feta = failureProbability(15, p);
assert(Feta > 0.5 && Feta < 0.7, `F(eta)≈0.63 got ${Feta.toFixed(3)}`);
const b10 = quantileLife(0.1, p);
assert(b10 > 0 && b10 < 15, `B10 < eta (${b10.toFixed(2)})`);
const mle = fitWeibullMLE([2, 3, 4, 5, 6, 7, 8]);
assert(!!mle && mle.shape > 0 && mle.scale > 0, 'MLE fit works');
const prior = paramsFromPrior(20, 10, 3);
assert(prior.method === 'prior' && prior.scale === 20, 'prior params');

// --- Risk: aged component ---
const old = computeComponentRisk({
  componentId: 'old',
  name: 'Old HP',
  type: 'SC4.6.2.6',
  installationYear: 2005,
  purchaseDate: null,
  expectedLifespanYears: 15,
  history: [
    { performed_date: '2015-01-01', category: 'acute' },
    { performed_date: '2018-06-01', category: 'acute' },
    { performed_date: '2021-03-01', category: 'acute' },
    { performed_date: '2023-09-01', category: 'acute' },
  ],
  asOf: new Date('2026-07-27'),
});
assert(old.ageYears > 20, `old age ~21 got ${old.ageYears}`);
assert(old.riskScore >= 30, `old elevated score got ${old.riskScore}`);
assert(old.riskLevel !== 'low', `old not low, got ${old.riskLevel}`);

// --- Risk: new component ---
const neu = computeComponentRisk({
  componentId: 'new',
  name: 'New',
  type: 'SC4.7',
  installationYear: 2024,
  purchaseDate: null,
  expectedLifespanYears: 20,
  history: [],
  asOf: new Date('2026-07-27'),
});
assert(neu.riskScore < old.riskScore, `new ${neu.riskScore} < old ${old.riskScore}`);

// --- Risk: unknown age ---
const unk = computeComponentRisk({
  componentId: 'unk',
  installationYear: null,
  purchaseDate: null,
  expectedLifespanYears: null,
  history: [],
  asOf: new Date('2026-07-27'),
});
assert(unk.confidence === 'low', 'unknown age = low confidence');
assert(unk.ageYears === 0, 'unknown age 0');

// --- Batch + filter ---
const batch = computeComponentRiskBatch([
  {
    componentId: 'a',
    name: 'A',
    type: 'SC1',
    installationYear: 2000,
    purchaseDate: null,
    expectedLifespanYears: 12,
    history: [],
    asOf: new Date('2026-07-27'),
  },
  {
    componentId: 'b',
    name: 'B',
    type: 'SC1',
    installationYear: 2023,
    purchaseDate: null,
    expectedLifespanYears: 20,
    history: [],
    asOf: new Date('2026-07-27'),
  },
]);
assert(batch[0].riskScore >= batch[1].riskScore, 'batch sorted by risk desc');
const highOnly = filterRiskResults(batch, { minLevel: 'high' });
assert(
  highOnly.every((r) => r.riskLevel === 'high' || r.riskLevel === 'critical'),
  'filter high+',
);

// --- Policy ---
const pol = normalizePolicy('org1', {
  ...DEFAULT_AGENT_POLICY,
  min_risk_level: 'high',
  excluded_component_types: ['SC1'],
});
const { allowed, skippedPolicy } = applyPolicyToRisks(
  batch.map((r) => ({ ...r, type: 'SC1' })),
  pol,
);
assert(allowed.length === 0 && skippedPolicy > 0, 'policy excludes SC1');

// --- Plan engine ---
const risks = [
  {
    ...old,
    componentId: 'c1',
    name: 'Entre',
    type: 'entréparti',
    riskLevel: 'critical',
    riskScore: 90,
    remainingB10Years: 0.2,
    confidence: 'high',
    recommendation: 'Byt snart',
  },
  {
    ...old,
    componentId: 'c2',
    name: 'VP',
    type: 'SC4.6.2.6',
    riskLevel: 'high',
    riskScore: 70,
    remainingB10Years: 2,
    confidence: 'medium',
    recommendation: 'Service',
  },
  {
    ...neu,
    componentId: 'c3',
    name: 'Flakt',
    type: 'SC4.7',
    riskLevel: 'high',
    riskScore: 60,
    remainingB10Years: 8,
    confidence: 'medium',
    recommendation: 'Ok',
  },
  {
    ...neu,
    componentId: 'c4',
    name: 'Lag',
    type: 'x',
    riskLevel: 'low',
    riskScore: 10,
    remainingB10Years: 1,
    confidence: 'high',
    recommendation: 'Ok',
  },
  {
    ...neu,
    componentId: 'c5',
    name: 'Medel',
    type: 'y',
    riskLevel: 'medium',
    riskScore: 40,
    remainingB10Years: 2,
    confidence: 'medium',
    recommendation: 'Ok',
  },
];

const items = generateMaintenancePlanItems(risks, {
  startYear: 2027,
  startQuarter: 2,
  horizonYears: 5,
  minRiskLevel: 'high',
  minConfidence: 'medium',
  asOf: new Date('2026-07-27'),
  unitPricesByType: { entréparti: 100000 },
  purchaseCosts: { c2: 50000 },
});
assert(items.length === 2, `plan 2 items got ${items.length}`);
assert(
  items[0].year === 2027 && items[0].quarter === 2,
  `critical at start Q got Q${items[0].quarter} ${items[0].year}`,
);
assert(
  items.find((i) => i.componentId === 'c1')?.estimatedCost === 100000,
  'unit price',
);
assert(
  items.find((i) => i.componentId === 'c1')?.costSource === 'unit_price',
  'cost source unit',
);
assert(
  items.find((i) => i.componentId === 'c2')?.estimatedCost === 50000,
  'purchase fallback',
);
assert(!items.find((i) => i.componentId === 'c3'), 'B10=8 excluded');
assert(!items.find((i) => i.componentId === 'c4'), 'low excluded');
assert(!items.find((i) => i.componentId === 'c5'), 'medium excluded at min high');

const med = generateMaintenancePlanItems(risks, {
  startYear: 2027,
  startQuarter: 2,
  horizonYears: 5,
  minRiskLevel: 'medium',
  minConfidence: 'medium',
  asOf: new Date('2026-07-27'),
});
assert(med.some((i) => i.componentId === 'c5'), 'medium included when min=medium');

const cost = resolveEstimatedCost('x', 'ENTRÉPARTI', {
  unitPricesByType: { entréparti: 100000 },
});
assert(cost.cost === 100000 && cost.source === 'unit_price', 'case-insensitive unit price');

const period = computePlanPeriod(2027, 2, 5);
assert(
  formatPlanPeriod(period) === 'Q2 2027 – Q1 2032',
  `period format: ${formatPlanPeriod(period)}`,
);
const nq = nextCalendarQuarter(new Date('2026-07-27'));
assert(nq.year === 2026 && nq.quarter === 4, `next Q from Jul is Q4 got Q${nq.quarter}`);

const sum = summarizePlanItems(items, {
  startYear: 2027,
  startQuarter: 2,
  horizonYears: 5,
});
assert(
  sum.itemCount === 2 && sum.totalEstimatedCost === 150000,
  `summary cost 150k got ${sum.totalEstimatedCost}`,
);

console.log('\nALL_SMOKE_PASSED', results.length, 'checks');
