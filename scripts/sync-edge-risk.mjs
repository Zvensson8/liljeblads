/**
 * Keep Deno edge copies of Weibull / componentRisk in sync with frontend.
 *
 * Canonical source: src/lib/weibull.ts + src/lib/componentRisk.ts
 * DO NOT hand-edit supabase/functions/_shared/{weibull,componentRisk}.ts
 *
 *   node scripts/sync-edge-risk.mjs           # write edge copies
 *   node scripts/sync-edge-risk.mjs --check   # exit 1 if out of sync (CI)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

const HEADER =
  '/** AUTO-GENERATED from src/lib — do not edit. Run: npm run sync:edge-risk */\n';

function transform(srcRel, replaceImport) {
  const src = path.join(root, srcRel);
  let text = fs.readFileSync(src, 'utf8');
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (replaceImport) {
    text = text.replace(
      /from ['"]@\/lib\/weibull['"]/g,
      "from './weibull.ts'",
    );
  }
  if (!text.startsWith('/** AUTO-GENERATED')) {
    text = HEADER + text;
  }
  return text;
}

function syncOne(srcRel, destRel, replaceImport) {
  const dest = path.join(root, destRel);
  const next = transform(srcRel, replaceImport);
  if (checkOnly) {
    if (!fs.existsSync(dest)) {
      console.error('MISSING edge copy:', destRel);
      process.exitCode = 1;
      return;
    }
    const cur = fs.readFileSync(dest, 'utf8');
    if (cur !== next) {
      console.error('OUT OF SYNC:', destRel);
      console.error('  Run: npm run sync:edge-risk');
      process.exitCode = 1;
      return;
    }
    console.log('ok', destRel);
    return;
  }
  fs.writeFileSync(dest, next, 'utf8');
  console.log('synced', srcRel, '→', destRel);
}

syncOne('src/lib/weibull.ts', 'supabase/functions/_shared/weibull.ts', false);
syncOne(
  'src/lib/componentRisk.ts',
  'supabase/functions/_shared/componentRisk.ts',
  true,
);

if (checkOnly) {
  if (process.exitCode) {
    console.error('Edge risk modules diverge from src/lib');
    process.exit(1);
  }
  console.log('edge risk in sync');
} else {
  console.log('done');
}
