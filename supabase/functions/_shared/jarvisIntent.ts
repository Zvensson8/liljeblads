/**
 * Fas 1A: detect explicit write intent so we can force apply_* / send_to_me.
 */

// No \b — JS word boundary is ASCII-only and breaks on Swedish letters
const APPLY_VERBS =
  /(skapa|lägg till|uppdatera|ändra|sätt|logga|skicka|mejla|maila|spara|registrera|markera|boka|beställ|ångra|ta bort|radera|arkivera|stäng|avsluta)/i;

const READ_ONLY =
  /\b(lista|visa|berätta|översikt|vilka|vad är|hur många|sök|hämta information)\b/i;

export function hasExplicitWriteIntent(userMessage: string): boolean {
  const t = (userMessage || "").trim();
  if (!t) return false;
  if (APPLY_VERBS.test(t)) return true;
  // "status till ordered" style
  if (/\btill\s+(ordered|completed|not_started|archived|pagaende|planerat)\b/i.test(t)) {
    return true;
  }
  return false;
}

export function looksReadOnly(userMessage: string): boolean {
  const t = (userMessage || "").trim();
  if (hasExplicitWriteIntent(t)) return false;
  return READ_ONLY.test(t);
}

export function toolsIncludeWrite(toolsUsed: string[]): boolean {
  return toolsUsed.some(
    (t) =>
      t.startsWith("apply_") ||
      t === "send_to_me" ||
      t === "batch_apply_actions" ||
      t.startsWith("undo_") ||
      t.startsWith("suggest_"),
  );
}

/** System nudge when model answered in text only despite write intent */
export const INTENT_FORCE_USER_NUDGE =
  "SYSTEM: Användaren bad uttryckligen om en åtgärd (skapa/ändra/logga/skicka/ångra). " +
  "Du svarade utan att anropa apply_*, send_to_me eller undo_*. " +
  "Anropa NU rätt verktyg. Om data saknas, fråga kort — hitta inte på att det är gjort.";
