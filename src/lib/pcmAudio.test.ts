import { describe, expect, it } from 'vitest';
import { float32ToPcm16Base64, pcm16Base64ToFloat32 } from './pcmAudio';

describe('pcmAudio', () => {
  it('roundtrips a short PCM buffer', () => {
    const src = new Float32Array([0, 0.5, -0.5, 0.25]);
    const b64 = float32ToPcm16Base64(src);
    expect(b64.length).toBeGreaterThan(4);
    const back = pcm16Base64ToFloat32(b64);
    expect(back.length).toBe(src.length);
    expect(back[1]).toBeGreaterThan(0.4);
    expect(back[2]).toBeLessThan(-0.4);
  });
});
