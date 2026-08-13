import { useCallback, useEffect, useRef, useState } from 'react';

/** Strip markdown / noise so TTS sounds natural */
export function textForSpeech(raw: string): string {
  let t = raw || '';
  // Drop follow-up suggestions after ---
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
    .replace(/[📊🔍⚠️✅❌]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Cap length for browser TTS
  if (t.length > 1200) t = t.slice(0, 1200) + ' …';
  return t;
}

function pickSwedishVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  const voices = speechSynthesis.getVoices();
  const sv =
    voices.find((v) => v.lang?.toLowerCase().startsWith('sv')) ||
    voices.find((v) => /swedish|svenska/i.test(v.name));
  return sv || voices.find((v) => v.default) || voices[0] || null;
}

/** Browser TTS for Jarvis replies (sv-SE when available). */
export function useTextToSpeech() {
  const [supported] = useState(
    () => typeof window !== 'undefined' && 'speechSynthesis' in window,
  );
  const [speaking, setSpeaking] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    // Chrome loads voices async
    const load = () => speechSynthesis.getVoices();
    load();
    speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => {
      speechSynthesis.cancel();
      speechSynthesis.removeEventListener?.('voiceschanged', load);
    };
  }, []);

  const stop = useCallback(() => {
    try {
      speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    utterRef.current = null;
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!supported) {
        onEnd?.();
        return;
      }
      stop();
      const clean = textForSpeech(text);
      if (!clean) {
        onEnd?.();
        return;
      }
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = 'sv-SE';
      u.rate = 1.05;
      u.pitch = 1;
      const voice = pickSwedishVoice();
      if (voice) u.voice = voice;
      u.onstart = () => setSpeaking(true);
      u.onend = () => {
        setSpeaking(false);
        utterRef.current = null;
        onEnd?.();
      };
      u.onerror = () => {
        setSpeaking(false);
        utterRef.current = null;
        onEnd?.();
      };
      utterRef.current = u;
      speechSynthesis.speak(u);
    },
    [supported, stop],
  );

  return { supported, speaking, speak, stop };
}
