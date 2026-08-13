import { describe, expect, it } from 'vitest';
import { firstSpokenSentences, textForSpeech } from '@/lib/textForSpeech';

describe('textForSpeech', () => {
  it('strips markdown and follow-ups for natural TTS', () => {
    const raw = `Här är **fakturaadressen** för Nolhaga: Storgatan 1.

---
- 👉 Visa mer?
- Nästa fråga`;
    const out = textForSpeech(raw);
    expect(out).toContain('fakturaadressen');
    expect(out).toContain('Nolhaga');
    expect(out).not.toContain('**');
    expect(out).not.toContain('Visa mer');
    expect(out).not.toContain('👉');
  });

  it('keeps two colleague sentences from a report dump', () => {
    const raw = `SAMMANFATTNING
Projektet Asfaltering parkering (23806) på Hjulet 1 & 2 är pågående (status: pagaende). Budget 4 000 000 kr, forecast 4 000 000 kr, faktiska kostnader 0 kr hittills. Start Q3 2026. Inget arbete har ännu fakturerats eller registrerats som utfört.

DETALJER
Fastighet: Hjulet 1 & 2, Ramgatan 4, Karlstad
Projekt-ID: 3f5ae5cc-2122-463b-b223-55e5b8206691
Länk: /projects/3f5ae5cc-2122-463b-b223-55e5b8206691

⚠️ AVVIKELSER & REKOMMENDATIONER
Inga avvikelser noterade.`;
    const out = textForSpeech(raw);
    expect(out.toLowerCase()).toContain('asfaltering');
    expect(out.toLowerCase()).toContain('hjulet');
    expect(out.toLowerCase()).not.toContain('sammanfattning');
    expect(out.toLowerCase()).not.toContain('detaljer');
    expect(out).not.toMatch(/3f5ae5cc/i);
    expect(out).not.toContain('/projects/');
    expect(out.toLowerCase()).not.toContain('pagaende');
    expect(out.toLowerCase()).toContain('pågår');
    expect(firstSpokenSentences(out, 2, 400).split(/(?<=[.!?])\s+/).length).toBeLessThanOrEqual(2);
  });
});
