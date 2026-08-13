/**
 * Rebuild speech-to-text from the Web Speech API result list.
 *
 * Chrome/Edge (esp. continuous + sv-SE) often emit progressive hypotheses as
 * separate results ("skicka", "skicka faktura", "skicka faktura adressen…").
 * Naively joining them produces the stacked garbage users see in the input.
 */

export type SpeechResultRow = {
  isFinal: boolean;
  0: { transcript: string };
};

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function normKey(s: string): string {
  return norm(s).toLowerCase();
}

/** True when `next` is a longer / refined re-hypothesis of `prev`, not new words. */
export function isProgressiveRespeak(prev: string, next: string): boolean {
  const a = normKey(prev);
  const b = normKey(next);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.startsWith(a) || a.startsWith(b)) return true;

  const aCompact = a.replace(/\s/g, '');
  const bCompact = b.replace(/\s/g, '');
  if (bCompact.startsWith(aCompact) || aCompact.startsWith(bCompact)) return true;
  if (b.includes(a) && b.length >= a.length) return true;

  const pw = a.split(' ');
  const nw = b.split(' ');
  if (pw[0] !== nw[0]) return false;

  let match = 0;
  while (match < pw.length && match < nw.length && pw[match] === nw[match]) {
    match++;
  }
  if (pw.length === 1) return nw[0] === pw[0];
  if (match >= 2) return true;
  if (match / pw.length >= 0.5 && b.length >= a.length * 0.6) return true;
  return false;
}

/**
 * Collapse a list of final segments into one utterance.
 * Progressive re-speaks replace; true word-by-word finals append.
 */
export function collapseProgressivePhrases(segments: string[]): string {
  let acc = '';
  for (const raw of segments) {
    const s = norm(raw);
    if (!s) continue;
    if (!acc) {
      acc = s;
      continue;
    }
    if (isProgressiveRespeak(acc, s)) {
      acc = s.length >= acc.length ? s : acc;
      continue;
    }
    acc = norm(`${acc} ${s}`);
  }
  return acc;
}

/**
 * True when heard speech is likely the TTS echo, not a user barge-in.
 * Used so Ara can keep talking unless the user actually interrupts.
 */
export function looksLikeTtsEcho(heard: string, spoken: string): boolean {
  const a = normKey(heard);
  const b = normKey(spoken);
  if (!a) return true;
  if (!b) return false;
  if (a.length < 4) return true;
  if (b.includes(a) || a.includes(b.slice(0, Math.min(48, b.length)))) {
    return true;
  }
  if (isProgressiveRespeak(b, a) || isProgressiveRespeak(a, b)) return true;

  const aw = a.split(' ').filter((w) => w.length > 2);
  const bw = new Set(b.split(' ').filter((w) => w.length > 2));
  if (!aw.length) return true;
  const overlap = aw.filter((w) => bw.has(w)).length / aw.length;
  return overlap >= 0.65;
}

export function mergeCommittedAndInterim(
  committed: string,
  interim: string,
): string {
  const c = norm(committed);
  const i = norm(interim);
  if (!i) return c;
  if (!c) return i;
  if (isProgressiveRespeak(c, i)) {
    return i.length >= c.length ? i : c;
  }
  return norm(`${c} ${i}`);
}

/**
 * Build committed + interim + full display string from a recognition event.
 */
export function transcriptFromSpeechResults(
  results: ArrayLike<SpeechResultRow> & { length: number },
  resultIndex: number,
): { committed: string; interim: string; full: string } {
  const finals: string[] = [];
  let interim = '';

  for (let i = 0; i < results.length; i++) {
    const row = results[i];
    const t = norm(row?.[0]?.transcript || '');
    if (!t) continue;
    if (row.isFinal) {
      finals.push(t);
    } else if (i >= resultIndex) {
      // Only the latest interim chunk from this event (replace, never append history)
      interim = t;
    }
  }

  // Fallback: last non-final anywhere (some engines leave interim below resultIndex)
  if (!interim) {
    for (let i = results.length - 1; i >= 0; i--) {
      if (!results[i].isFinal) {
        interim = norm(results[i]?.[0]?.transcript || '');
        break;
      }
    }
  }

  const committed = collapseProgressivePhrases(finals);
  const full = mergeCommittedAndInterim(committed, interim);
  return { committed, interim, full };
}
