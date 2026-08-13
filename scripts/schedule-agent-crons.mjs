/**
 * Schedule / update agent graph cron jobs via Supabase SQL (pg_cron + pg_net).
 * Reads CRON_SECRET from .secrets.local — does not print the secret.
 *
 * Usage: node scripts/schedule-agent-crons.mjs
 * Requires: SUPABASE_ACCESS_TOKEN in env or .secrets.local
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

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

const secret = process.env.CRON_SECRET;
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!secret || !token) {
  console.error('Need CRON_SECRET and SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

const base = 'https://ojiswgqntenvbwtopxbu.supabase.co/functions/v1';
const esc = secret.replace(/'/g, "''");

function scheduleJob(name, schedule, path) {
  const url = `${base}/${path}`;
  // unschedule by name if exists
  return `
DO $body$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = '${name}' LIMIT 1;
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END;
$body$;

SELECT cron.schedule(
  '${name}',
  '${schedule}',
  $cmd$SELECT net.http_post(
    url := '${url}',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '${esc}'
    ),
    body := '{}'::jsonb
  );$cmd$
);
`;
}

const sql = [
  scheduleJob('risk-suggest-actions-daily', '0 6 * * *', 'risk-suggest-actions'),
  // Jarvis daily briefing to org owners/admins (weekdays 06:15 UTC)
  scheduleJob('jarvis-daily-briefing-weekdays', '15 6 * * 1-5', 'jarvis-daily-briefing'),
  // Fas 0: process embedding queue often so PDF become AI-indexed quickly
  scheduleJob('generate-embeddings-quarter-hourly', '*/15 * * * *', 'generate-embeddings'),
  scheduleJob('weekly-org-digest-monday', '0 7 * * 1', 'weekly-org-digest'),
  `SELECT jobid, jobname, schedule FROM cron.job WHERE jobname IN ('risk-suggest-actions-daily','jarvis-daily-briefing-weekdays','generate-embeddings-quarter-hourly','weekly-org-digest-monday','process-embedding-queue') ORDER BY jobname;`,
].join('\n');

const tmp = resolve(process.cwd(), '_schedule_crons.sql');
writeFileSync(tmp, sql, 'utf8');

try {
  process.env.SUPABASE_ACCESS_TOKEN = token;
  const out = execSync(`npx supabase db query --linked -f "${tmp}"`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 10 * 1024 * 1024,
  });
  // Redact any accidental secret echoes
  console.log(out.replaceAll(secret, '[REDACTED]'));
  console.log('OK: scheduled risk-suggest-actions-daily + weekly-org-digest-monday');
} catch (e) {
  console.error(String(e.stderr || e.message || e).replaceAll(secret, '[REDACTED]'));
  process.exit(1);
} finally {
  try {
    unlinkSync(tmp);
  } catch {
    /* ignore */
  }
}
