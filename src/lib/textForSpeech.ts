const STATUS_SPOKEN: Record<string, string> = {
  pagaende: 'pågår',
  not_started: 'inte påbörjad',
  awaiting_quote: 'väntar på offert',
  ordered: 'beställd',
  completed: 'klar',
  archived: 'arkiverad',
  forslag: 'förslag',
  planerat: 'planerat',
  invantar_offert: 'väntar på offert',
  offert_finns: 'offert finns',
  pausat: 'pausat',
  avslutat: 'avslutat',
};

/** Drop report chrome, ids and paths so the line can be spoken. */
export function stripReportChrome(raw: string): string {
  let t = raw || '';
  const div = t.lastIndexOf('\n---');
  if (div > 0) t = t.slice(0, div);
  t = t
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/👉/g, '')
    .replace(/📊|🔍|⚠\uFE0F?|✅|❌|ℹ\uFE0F?/gu, '')
    .replace(/^\s*SAMMANFATTNING\s*/gim, '')
    .replace(/^\s*DETALJER\s*/gim, '')
    .replace(/^\s*AVVIKELSER\s*(&|och)?\s*REKOMMENDATIONER[\s\S]*$/gim, '')
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '',
    )
    .replace(/\/(?:projects|work-orders|property|components)\/\S+/gi, '')
    .replace(/^\s*(Projekt-ID|Länk|ID)\s*:.*$/gim, '')
    .replace(/\bstatus:\s*([a-z_]+)\b/gi, (_, code: string) => {
      const mapped = STATUS_SPOKEN[String(code).toLowerCase()];
      return mapped || code;
    });

  for (const [code, spoken] of Object.entries(STATUS_SPOKEN)) {
    t = t.replace(new RegExp(`\\b${code}\\b`, 'gi'), spoken);
  }

  return t.replace(/\s+/g, ' ').trim();
}

/** Keep the first n spoken sentences, hard-capped. */
export function firstSpokenSentences(
  text: string,
  maxSentences = 2,
  maxChars = 340,
): string {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const kept: string[] = [];
  for (const p of parts) {
    if (kept.length >= maxSentences) break;
    const next = [...kept, p].join(' ');
    if (next.length > maxChars && kept.length > 0) break;
    kept.push(p);
  }
  let out = kept.join(' ').trim();
  if (out.length > maxChars) out = `${out.slice(0, maxChars - 1).trim()}…`;
  return out;
}

/** Strip markdown / noise so TTS sounds like a colleague, not a report. */
export function textForSpeech(raw: string): string {
  return firstSpokenSentences(stripReportChrome(raw), 2, 340);
}
