import { describe, expect, it } from 'vitest';
import {
  collapseProgressivePhrases,
  looksLikeTtsEcho,
  mergeCommittedAndInterim,
  transcriptFromSpeechResults,
} from './speechTranscript';

describe('speechTranscript', () => {
  it('collapses progressive stacked hypotheses (user bug)', () => {
    const stacked = [
      'skicka',
      'skicka',
      'skicka fakt',
      'skicka faktur',
      'skicka faktura',
      'skicka  faktura',
      'skicka  faktura ad',
      'skicka  faktura adress',
      'skicka  fakturaadress',
      'skicka  fakturaadressen',
      'skicka  faktura adressen till',
      'skicka  faktura adressen till Nol',
      'skicka  faktura adressen till Nola',
      'skicka  faktura adressen till Nolhaga',
      'skicka faktura adressen till  Nolhaga',
      'skicka fakturaadressen till Nolhaga',
    ];
    const out = collapseProgressivePhrases(stacked);
    expect(out.toLowerCase()).toContain('nolhaga');
    expect(out.toLowerCase()).toMatch(/skicka/);
    // Must not repeat "skicka" many times
    expect((out.toLowerCase().match(/skicka/g) || []).length).toBe(1);
  });

  it('still appends true word-by-word finals', () => {
    expect(
      collapseProgressivePhrases([
        'skicka',
        'faktura',
        'adressen',
        'till',
        'Nolhaga',
      ]),
    ).toBe('skicka faktura adressen till Nolhaga');
  });

  it('rebuilds from SpeechRecognition-like results without stacking', () => {
    const stacked = [
      'skicka',
      'skicka faktura',
      'skicka faktura adressen till Nolhaga',
    ];
    const results = stacked.map((t) => ({
      isFinal: true as const,
      0: { transcript: t },
    }));
    const { full } = transcriptFromSpeechResults(results, results.length - 1);
    expect(full).toBe('skicka faktura adressen till Nolhaga');
  });

  it('uses latest interim only (replace, not append)', () => {
    const results = [
      { isFinal: true, 0: { transcript: 'skicka' } },
      { isFinal: false, 0: { transcript: 'skicka fakt' } },
      { isFinal: false, 0: { transcript: 'skicka faktura adressen' } },
    ];
    const { full, interim } = transcriptFromSpeechResults(results, 1);
    expect(interim).toBe('skicka faktura adressen');
    expect(full).toBe('skicka faktura adressen');
  });

  it('detects TTS echo vs real barge-in', () => {
    const spoken =
      'klart. arbetsordern på nolhaga är arkiverad. du kan ångra inom fem minuter.';
    expect(looksLikeTtsEcho('klart arbetsordern på nolhaga', spoken)).toBe(true);
    expect(looksLikeTtsEcho('vänta arkivera den andra också', spoken)).toBe(
      false,
    );
    expect(looksLikeTtsEcho('mm', spoken)).toBe(true);
  });

  it('merges interim progressive over committed', () => {
    expect(
      mergeCommittedAndInterim(
        'skicka faktura',
        'skicka faktura adressen till Nolhaga',
      ),
    ).toBe('skicka faktura adressen till Nolhaga');
  });
});
