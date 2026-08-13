/**
 * Fas 0: validate golden prompts fixture structure + intent classification.
 * No live LLM — pure policy checks.
 * Note: JS \b is ASCII-only; Swedish verbs match without \b.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const path = resolve(process.cwd(), 'fixtures/jarvis-golden-prompts.json');
const data = JSON.parse(readFileSync(path, 'utf8'));

if (!data.prompts?.length || data.prompts.length < 10) {
  console.error('Need at least 10 golden prompts');
  process.exit(1);
}

// Keep in sync with jarvisIntent.ts / jarvisPolicy.ts (no \b — Swedish letters)
const APPLY_RE =
  /(skapa|lägg till|uppdatera|ändra|sätt|logga|skicka|mejla|maila|spara|registrera|markera|boka|beställ|ångra|ta bort|radera|arkivera|stäng|avsluta)/i;

let failed = 0;
const ids = new Set();

for (const p of data.prompts) {
  if (!p.id || !p.text || !p.expectIntent || !Array.isArray(p.expectToolsAny)) {
    console.error('Invalid prompt entry', p);
    failed++;
    continue;
  }
  if (ids.has(p.id)) {
    console.error('Duplicate id', p.id);
    failed++;
  }
  ids.add(p.id);

  const looksApply = APPLY_RE.test(p.text);
  if (p.expectIntent === 'apply' && !looksApply) {
    console.error(`Prompt ${p.id}: expectIntent=apply but text lacks apply verbs`);
    failed++;
  }
  if (!p.expectToolsAny.length) {
    console.error(`Prompt ${p.id}: empty expectToolsAny`);
    failed++;
  }
}

if (failed) {
  console.error(`${failed} golden prompt check(s) failed`);
  process.exit(1);
}
console.log(`OK ${data.prompts.length} golden prompts validated.`);
