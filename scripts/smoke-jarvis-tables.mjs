/**
 * Smoke: verify Jarvis P1–P3 tables exist and are readable with service role.
 * Usage: node scripts/smoke-jarvis-tables.mjs
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or from .env / .secrets.local)
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv(resolve(process.cwd(), '.secrets.local'));
loadEnv(resolve(process.cwd(), '.env'));

const url =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SERVICE_ROLE_KEY;

if (!url || !key) {
  // Fallback: SQL via linked CLI (needs SUPABASE_ACCESS_TOKEN + linked project)
  if (process.env.SUPABASE_ACCESS_TOKEN) {
    const { execSync } = await import('child_process');
    const { writeFileSync, unlinkSync } = await import('fs');
    const sql = `SELECT to_regclass('public.jarvis_action_log') AS jarvis_action_log,
      to_regclass('public.document_ingest_batches') AS document_ingest_batches,
      (SELECT count(*)::int FROM information_schema.columns
        WHERE table_schema='public' AND table_name='jarvis_action_log'
        AND column_name IN ('reverse_payload','idempotency_key','result_full')) AS p2_cols;`;
    const tmp = resolve(process.cwd(), '_smoke_jarvis_tables.sql');
    writeFileSync(tmp, sql, 'utf8');
    try {
      const out = execSync(`npx supabase db query --linked -f "${tmp}"`, {
        encoding: 'utf8',
        env: process.env,
      });
      console.log(out);
      if (!/jarvis_action_log/.test(out) || !/document_ingest_batches/.test(out)) {
        console.error('Expected tables not found in SQL output');
        process.exit(1);
      }
      console.log('All Jarvis table smoke checks passed (via db query).');
      process.exit(0);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }
  console.error(
    'Need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ACCESS_TOKEN for linked db query',
  );
  process.exit(1);
}

const tables = [
  'jarvis_action_log',
  'document_ingest_batches',
  'property_documents',
  'embedding_queue',
  'ai_suggested_actions',
  'project_cost_items',
  'project_budget_items',
  'project_checklist_items',
  'property_todos',
];

let failed = 0;

for (const table of tables) {
  const res = await fetch(
    `${url}/rest/v1/${table}?select=id&limit=1`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'count=exact',
      },
    },
  );
  if (!res.ok) {
    const body = await res.text();
    console.error(`FAIL ${table}: HTTP ${res.status} ${body.slice(0, 200)}`);
    failed++;
  } else {
    const range = res.headers.get('content-range') || '';
    console.log(`OK   ${table}  ${range || '(readable)'}`);
  }
}

// Column checks for P2
const colRes = await fetch(
  `${url}/rest/v1/jarvis_action_log?select=id,reverse_payload,idempotency_key,result_full,undone_at&limit=1`,
  {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  },
);
if (!colRes.ok) {
  console.error('FAIL jarvis_action_log P2 columns:', await colRes.text());
  failed++;
} else {
  console.log('OK   jarvis_action_log P2 columns (reverse_payload, idempotency_key, …)');
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll Jarvis table smoke checks passed.');
