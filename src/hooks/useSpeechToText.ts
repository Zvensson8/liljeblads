import { useCallback, useEffect, useRef, useState } from 'react';

/** Minimal typings for Web Speech API (Chrome/Edge). */
type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: { transcript: string };
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike> & { length: number };
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
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

function joinParts(...parts: string[]): string {
  return parts
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

/**
 * Browser speech → text for Jarvis.
 *
 * Important: interim results must *replace* the live draft, not append.
 * Callers pass the current field value as baseText; onUpdate always gets
 * the full field value (base + this session).
 */
export function useSpeechToText(opts?: { lang?: string }) {
  const lang = opts?.lang || 'sv-SE';
  const [supported] = useState(() => Boolean(getRecognitionCtor()));
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const committedRef = useRef('');
  const baseRef = useRef('');
  const onUpdateRef = useRef<(text: string) => void>(() => {});

  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  /**
   * @param baseText — input value when mic starts (preserved)
   * @param onUpdate — called with full text whenever interim/final changes
   */
  const start = useCallback(
    (baseText: string, onUpdate: (text: string) => void) => {
      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        setError(
          'Röstinmatning stöds inte i den här webbläsaren (prova Chrome eller Edge).',
        );
        return;
      }

      // Stop previous session if any
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }

      setError(null);
      baseRef.current = baseText.trim();
      committedRef.current = '';
      onUpdateRef.current = onUpdate;

      const rec = new Ctor();
      rec.lang = lang;
      // continuous = true so longer Swedish phrases work; user stops with mic button
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (ev) => {
        let interim = '';
        // Only process from resultIndex (new results); rebuild committed from all finals
        let committed = '';
        for (let i = 0; i < ev.results.length; i++) {
          const row = ev.results[i];
          const t = (row?.[0]?.transcript || '').trim();
          if (!t) continue;
          if (row.isFinal) {
            committed = joinParts(committed, t);
          } else if (i >= ev.resultIndex) {
            // Latest interim only (last non-final chunk)
            interim = t;
          }
        }
        // Prefer full rebuild of finals from all results for stability
        committedRef.current = committed;

        const full = joinParts(baseRef.current, committed, interim);
        onUpdateRef.current(full);
      };

      rec.onerror = (ev) => {
        const code = ev.error || '';
        // Benign: user stopped, or silence
        if (code === 'aborted' || code === 'no-speech') {
          setListening(false);
          return;
        }
        if (code === 'not-allowed') {
          setError('Mikrofon nekad — tillåt mikrofon i webbläsaren.');
        } else if (code === 'network') {
          setError('Nätverksfel vid röstigenkänning. Försök igen.');
        } else {
          setError(`Röstfel: ${code}`);
        }
        setListening(false);
      };

      rec.onend = () => {
        // If continuous session ended unexpectedly while still "listening", don't restart
        // (avoids loops). User can press mic again.
        setListening(false);
        recRef.current = null;
      };

      recRef.current = rec;
      try {
        rec.start();
        setListening(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Kunde inte starta mikrofon');
        setListening(false);
        recRef.current = null;
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
