import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { env, functionsUrl } from '@/lib/env';
import { textForSpeech } from '@/lib/textForSpeech';

export { textForSpeech };

function pickSwedishVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  const voices = speechSynthesis.getVoices();
  const sv =
    voices.find((v) => v.lang?.toLowerCase().startsWith('sv')) ||
    voices.find((v) => /swedish|svenska/i.test(v.name));
  return sv || voices.find((v) => v.default) || voices[0] || null;
}

async function fetchGrokSpeech(
  text: string,
  signal: AbortSignal,
): Promise<Blob> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('no-session');
  }
  const res = await fetch(functionsUrl('jarvis-tts'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: env.supabasePublishableKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, voice: 'ara' }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`tts ${res.status}`);
  }
  return res.blob();
}

/**
 * Jarvis speech: Grok neural voice (Ara) via edge proxy.
 * Falls back to browser speechSynthesis if offline / error.
 */
export function useTextToSpeech() {
  const [supported] = useState(
    () =>
      typeof window !== 'undefined' &&
      ('speechSynthesis' in window || typeof Audio !== 'undefined'),
  );
  const [speaking, setSpeaking] = useState(false);
  const [engine, setEngine] = useState<'grok' | 'browser' | null>(null);

  const genRef = useRef(0);
  const onEndRef = useRef<(() => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);

  const cleanupMedia = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
        audioRef.current.load();
      } catch {
        /* ignore */
      }
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    try {
      speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    utterRef.current = null;
  }, []);

  useEffect(() => {
    const load = () => {
      try {
        speechSynthesis.getVoices();
      } catch {
        /* ignore */
      }
    };
    load();
    speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => {
      genRef.current += 1;
      onEndRef.current = null;
      cleanupMedia();
      speechSynthesis.removeEventListener?.('voiceschanged', load);
    };
  }, [cleanupMedia]);

  const finish = useCallback((gen: number) => {
    if (gen !== genRef.current) return;
    setSpeaking(false);
    const cb = onEndRef.current;
    onEndRef.current = null;
    cb?.();
  }, []);

  const speakBrowser = useCallback(
    (clean: string, gen: number) => {
      if (typeof speechSynthesis === 'undefined') {
        finish(gen);
        return;
      }
      setEngine('browser');
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = 'sv-SE';
      u.rate = 1.05;
      u.pitch = 1;
      const voice = pickSwedishVoice();
      if (voice) u.voice = voice;
      u.onstart = () => {
        if (gen === genRef.current) setSpeaking(true);
      };
      u.onend = () => finish(gen);
      u.onerror = () => finish(gen);
      utterRef.current = u;
      window.setTimeout(() => {
        if (gen !== genRef.current) return;
        try {
          speechSynthesis.speak(u);
        } catch {
          finish(gen);
        }
      }, 40);
    },
    [finish],
  );

  const stop = useCallback(() => {
    genRef.current += 1;
    onEndRef.current = null;
    cleanupMedia();
    setSpeaking(false);
  }, [cleanupMedia]);

  /** Call from a click so later Audio.play() is allowed (Safari/Chrome). */
  const unlock = useCallback(() => {
    try {
      const silent = new Audio(
        'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA',
      );
      silent.volume = 0.01;
      void silent.play().catch(() => undefined);
    } catch {
      /* ignore */
    }
  }, []);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      const gen = ++genRef.current;
      cleanupMedia();
      setSpeaking(false);

      const clean = textForSpeech(text);
      if (!clean) {
        onEnd?.();
        return;
      }

      onEndRef.current = onEnd || null;
      setSpeaking(true);

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        speakBrowser(clean, gen);
        return;
      }

      const ac = new AbortController();
      abortRef.current = ac;
      const timeout = window.setTimeout(() => ac.abort(), 14000);

      void (async () => {
        try {
          const blob = await fetchGrokSpeech(clean, ac.signal);
          window.clearTimeout(timeout);
          if (gen !== genRef.current) return;

          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          const audio = new Audio(url);
          audioRef.current = audio;
          setEngine('grok');

          audio.onended = () => {
            if (urlRef.current === url) {
              URL.revokeObjectURL(url);
              urlRef.current = null;
            }
            finish(gen);
          };
          audio.onerror = () => {
            if (gen !== genRef.current) return;
            speakBrowser(clean, gen);
          };

          try {
            await audio.play();
          } catch {
            if (gen !== genRef.current) return;
            speakBrowser(clean, gen);
          }
        } catch {
          window.clearTimeout(timeout);
          if (gen !== genRef.current) return;
          speakBrowser(clean, gen);
        }
      })();
    },
    [cleanupMedia, finish, speakBrowser],
  );

  return { supported, speaking, speak, stop, unlock, engine };
}
