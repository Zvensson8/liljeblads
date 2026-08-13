import { describe, expect, it } from 'vitest';
import { textForSpeech } from '@/lib/textForSpeech';

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

  it('strips report headings so speech sounds conversational', () => {
    const raw = `📊 SAMMANFATTNING
Fakturaadressen är Storgatan 1.

🔍 DETALJER
Kontakt: Axcell.`;
    const out = textForSpeech(raw);
    expect(out).toContain('Fakturaadressen');
    expect(out).toContain('Axcell');
    expect(out.toLowerCase()).not.toContain('sammanfattning');
    expect(out.toLowerCase()).not.toContain('detaljer');
  });
});
