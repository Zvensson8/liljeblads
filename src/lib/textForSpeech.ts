/** Strip markdown / noise so TTS sounds like a person, not a report. */
export function textForSpeech(raw: string): string {
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
    .replace(/^\s*AVVIKELSER\s*(&|och)?\s*REKOMMENDATIONER\s*/gim, 'Avvikelser: ')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > 1500) t = t.slice(0, 1500) + ' …';
  return t;
}
