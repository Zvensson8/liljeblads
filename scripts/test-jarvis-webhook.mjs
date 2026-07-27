/**
 * Smoke-test Jarvis webhook endpoints with API key from jarvis-worker/.env
 * Run from repo root:
 *   node scripts/test-jarvis-webhook.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, 'jarvis-worker', '.env');

function loadEnv(p) {
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function summarize(type, data) {
  if (!data || data.success === false) {
    return data?.error || JSON.stringify(data).slice(0, 120);
  }
  switch (type) {
    case 'list_properties':
    case 'list_work_orders':
    case 'list_high_risk_components':
      return `count=${data.count ?? (data.results || []).length}`;
    case 'get_property_overview': {
      const r = data.result || {};
      const c = r.counts || {};
      return (
        `property=${r.property?.name || '?'} · components=${c.components ?? 0} · ` +
        `open_WO=${c.open_work_orders ?? 0} · docs=${c.documents ?? 0} · ` +
        `high_risk=${c.high_risk ?? 0} · plan=${r.maintenance_plan ? 'yes' : 'no'}`
      );
    }
    case 'search_property_documents':
      return (
        `metadata=${data.count ?? (data.results || []).length} · ` +
        `semantic=${(data.semantic_hits || []).length}` +
        (data.note ? ` · note=${String(data.note).slice(0, 60)}…` : '')
      );
    default:
      return `keys=${Object.keys(data).join(',')}`;
  }
}

const env = loadEnv(envPath);
const key = env.LILJEBLADS_API_KEY;
const base =
  env.LILJEBLADS_WEBHOOK_URL ||
  'https://ojiswgqntenvbwtopxbu.supabase.co/functions/v1/crewai-webhook';

if (!key) {
  console.error('Missing LILJEBLADS_API_KEY in jarvis-worker/.env');
  process.exit(1);
}

async function call(type, body = {}) {
  const r = await fetch(base, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'x-api-key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type, ...body }),
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

const tests = [
  ['list_properties', {}],
  ['list_work_orders', { limit: 5 }],
  ['list_high_risk_components', { limit: 5, min_level: 'high' }],
  ['get_property_overview', { property_name: 'Automaten' }],
  ['search_property_documents', { query: 'vent', limit: 5 }],
];

console.log('Webhook:', base);
let fail = 0;
for (const [type, body] of tests) {
  const { status, data } = await call(type, body);
  const ok = status < 400 && data.success !== false;
  if (!ok) fail += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${status} ${type}: ${summarize(type, data)}`);
}

if (fail === 0) {
  console.log('\nAll webhook smoke tests passed.');
} else {
  console.log(`\n${fail} test(s) failed.`);
}
process.exit(fail ? 1 : 0);
