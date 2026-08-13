import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean }> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** Fas 5: browser speech → text for Jarvis (Chrome/Edge) */
export function useSpeechToText(opts?: { lang?: string }) {
  const lang = opts?.lang || 'sv-SE';
  const [supported] = useState(() => Boolean(getRecognitionCtor()));
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const start = useCallback(
    (onFinal: (text: string) => void) => {
      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        setError('Röstinmatning stöds inte i den här webbläsaren (prova Chrome/Edge).');
        return;
      }
      setError(null);
      const rec = new Ctor();
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = true;
      rec.onresult = (ev) => {
        const parts: string[] = [];
        for (let i = 0; i < ev.results.length; i++) {
          const row = ev.results[i];
          if (row?.[0]?.transcript) parts.push(row[0].transcript);
        }
        const text = parts.join(' ').trim();
        if (text) onFinal(text);
      };
      rec.onerror = (ev) => {
        setError(ev.error || 'Röstfel');
        setListening(false);
      };
      rec.onend = () => setListening(false);
      recRef.current = rec;
      try {
        rec.start();
        setListening(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Kunde inte starta mikrofon');
        setListening(false);
      }
    },
    [lang],
  );

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  return { supported, listening, error, start, stop };
}
