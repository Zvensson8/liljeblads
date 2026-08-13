import { useCallback, useEffect, useRef, useState } from 'react';
import {
  transcriptFromSpeechResults,
  type SpeechResultRow,
} from '@/lib/speechTranscript';

/** Minimal typings for Web Speech API (Chrome/Edge). */
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechResultRow> & { length: number };
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
 * Browser speech → text for Jarvis (mic button dictation).
 *
 * Interim/progressive hypotheses *replace* the draft — never stack.
 * Full field value = baseText (when mic started) + this session.
 */
export function useSpeechToText(opts?: { lang?: string }) {
  const lang = opts?.lang || 'sv-SE';
  const [supported] = useState(() => Boolean(getRecognitionCtor()));
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef('');
  const onUpdateRef = useRef<(text: string) => void>(() => {});
  const listeningRef = useRef(false);

  useEffect(() => {
    return () => {
      listeningRef.current = false;
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

      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }

      setError(null);
      baseRef.current = baseText.trim();
      onUpdateRef.current = onUpdate;
      listeningRef.current = true;

      const rec = new Ctor();
      rec.lang = lang;
      // continuous=true for multi-word Swedish; progressive finals are collapsed
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (ev) => {
        if (!listeningRef.current) return;
        const { full: session } = transcriptFromSpeechResults(
          ev.results,
          ev.resultIndex,
        );
        const full = joinParts(baseRef.current, session);
        onUpdateRef.current(full);
      };

      rec.onerror = (ev) => {
        const code = ev.error || '';
        if (code === 'aborted' || code === 'no-speech') {
          listeningRef.current = false;
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
        listeningRef.current = false;
        setListening(false);
      };

      rec.onend = () => {
        // Keep last transcript in the field; just end listening state.
        // (Do not restart — avoids double sessions stacking into the field.)
        listeningRef.current = false;
        setListening(false);
        recRef.current = null;
      };

      recRef.current = rec;
      try {
        rec.start();
        setListening(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Kunde inte starta mikrofon');
        listeningRef.current = false;
        setListening(false);
        recRef.current = null;
      }
    },
    [lang],
  );

  const stop = useCallback(() => {
    listeningRef.current = false;
    try {
      // stop() flushes a final result; abort() can drop the last words
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  return { supported, listening, error, start, stop };
}
