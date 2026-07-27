/**
 * Smoke-test Jarvis webhook endpoints with API key from jarvis-worker/.env
 * Run from repo root after deploy:
 *   node --env-file=jarvis-worker/.env scripts/test-jarvis-webhook.mjs
 * or PowerShell:
 *   npx tsx scripts/test-jarvis-webhook.mjs
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
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

console.log('Webhook:', base.replace(/lbl_.*/, 'lbl_***'));
let fail = 0;
for (const [type, body] of tests) {
  const { status, data } = await call(type, body);
  const ok = status < 400 && data.success !== false;
  if (!ok) fail += 1;
  const detail = ok
    ? `count=${data.count ?? data.result?.counts?.components ?? Object.keys(data).length}`
    : (data.error || JSON.stringify(data)).slice(0, 120);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${status} ${type}: ${detail}`);
}
process.exit(fail ? 1 : 0);
