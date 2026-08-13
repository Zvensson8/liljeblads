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
    .replace(/📊|🔍|⚠\uFE0F?|✅|❌|ℹ\uFE0F?/gu, '')
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
  const onEndRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Chrome loads voices async
    const load = () => {
      speechSynthesis.getVoices();
    };
    load();
    speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => {
      speechSynthesis.cancel();
      speechSynthesis.removeEventListener?.('voiceschanged', load);
    };
  }, []);

  const stop = useCallback(() => {
    onEndRef.current = null;
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
      // Cancel previous without clearing the new onEnd
      try {
        speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
      utterRef.current = null;
      setSpeaking(false);

      const clean = textForSpeech(text);
      if (!clean) {
        onEnd?.();
        return;
      }

      onEndRef.current = onEnd || null;
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
        const cb = onEndRef.current;
        onEndRef.current = null;
        cb?.();
      };
      u.onerror = () => {
        setSpeaking(false);
        utterRef.current = null;
        const cb = onEndRef.current;
        onEndRef.current = null;
        cb?.();
      };
      utterRef.current = u;

      // Chrome bug: speak() right after cancel() can be silent — small defer
      window.setTimeout(() => {
        try {
          speechSynthesis.speak(u);
        } catch {
          setSpeaking(false);
          const cb = onEndRef.current;
          onEndRef.current = null;
          cb?.();
        }
      }, 40);
    },
    [supported],
  );

  return { supported, speaking, speak, stop };
}
