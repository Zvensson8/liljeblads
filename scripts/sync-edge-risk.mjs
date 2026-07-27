/**
 * Keep Deno edge copies of Weibull / componentRisk in sync with frontend.
 * Run: node scripts/sync-edge-risk.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sync(srcRel, destRel, replaceImport) {
  const src = path.join(root, srcRel);
  const dest = path.join(root, destRel);
  let text = fs.readFileSync(src, 'utf8');
  if (replaceImport) {
    text = text.replace(
      /from ['"]@\/lib\/weibull['"]/g,
      "from './weibull.ts'",
    );
  }
  fs.writeFileSync(dest, text, 'utf8');
  console.log('synced', srcRel, '→', destRel);
}

sync('src/lib/weibull.ts', 'supabase/functions/_shared/weibull.ts', false);
sync('src/lib/componentRisk.ts', 'supabase/functions/_shared/componentRisk.ts', true);
console.log('done');
