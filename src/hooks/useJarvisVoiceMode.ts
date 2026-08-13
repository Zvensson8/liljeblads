import { useCallback, useEffect, useRef, useState } from 'react';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking';

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

export type VoiceModeOptions = {
  lang?: string;
  /** After final speech, wait this long before auto-send (ms) */
  silenceMs?: number;
  /** Called with user utterance — should send chat and return assistant text */
  onUserUtterance: (text: string) => Promise<string | null>;
  enabled: boolean;
  isBusy?: boolean;
};

/**
 * Conversational voice loop: listen → auto-send → speak reply → listen again.
 * Closer to ChatGPT/Grok voice than one-shot dictation.
 */
export function useJarvisVoiceMode(opts: VoiceModeOptions) {
  const lang = opts.lang || 'sv-SE';
  const silenceMs = opts.silenceMs ?? 1400;
  const [supported] = useState(() => Boolean(getRecognitionCtor()));
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tts = useTextToSpeech();
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const phaseRef = useRef<VoicePhase>('idle');
  const committedRef = useRef('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendingRef = useRef(false);
  const onUtteranceRef = useRef(opts.onUserUtterance);
  const busyRef = useRef(opts.isBusy);

  useEffect(() => {
    onUtteranceRef.current = opts.onUserUtterance;
  }, [opts.onUserUtterance]);
  useEffect(() => {
    busyRef.current = opts.isBusy;
  }, [opts.isBusy]);

  const setPhaseBoth = (p: VoicePhase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const abortRec = useCallback(() => {
    clearSilenceTimer();
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }
    recRef.current = null;
  }, []);

  const stopAll = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    abortRec();
    tts.stop();
    setLiveTranscript('');
    committedRef.current = '';
    sendingRef.current = false;
    setPhaseBoth('idle');
  }, [abortRec, tts]);

  const speakThenMaybeListen = useCallback(
    (reply: string) => {
      if (!activeRef.current) return;
      setPhaseBoth('speaking');
      tts.speak(reply, () => {
        if (!activeRef.current) return;
        // Small pause then listen again
        setTimeout(() => {
          if (activeRef.current && !busyRef.current) {
            // re-enter listen via startListen ref
            startListenRef.current?.();
          }
        }, 400);
      });
    },
    [tts],
  );

  const submitUtterance = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean || sendingRef.current || !activeRef.current) return;
      sendingRef.current = true;
      abortRec();
      setLiveTranscript('');
      committedRef.current = '';
      setPhaseBoth('thinking');
      try {
        const reply = await onUtteranceRef.current(clean);
        if (!activeRef.current) return;
        if (reply?.trim()) {
          speakThenMaybeListen(reply);
        } else {
          startListenRef.current?.();
        }
      } catch {
        if (activeRef.current) {
          setError('Kunde inte få svar från Jarvis.');
          startListenRef.current?.();
        }
      } finally {
        sendingRef.current = false;
      }
    },
    [abortRec, speakThenMaybeListen],
  );

  const startListenRef = useRef<(() => void) | null>(null);

  const startListen = useCallback(() => {
    if (!activeRef.current) return;
    if (busyRef.current || sendingRef.current) return;
    if (phaseRef.current === 'speaking') tts.stop();

    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError('Röst stöds inte — prova Chrome eller Edge.');
      stopAll();
      return;
    }

    abortRec();
    setError(null);
    committedRef.current = '';
    setLiveTranscript('');
    setPhaseBoth('listening');

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (ev) => {
      if (!activeRef.current || phaseRef.current !== 'listening') return;

      let committed = '';
      let interim = '';
      for (let i = 0; i < ev.results.length; i++) {
        const row = ev.results[i];
        const t = (row?.[0]?.transcript || '').trim();
        if (!t) continue;
        if (row.isFinal) committed = joinParts(committed, t);
        else if (i >= ev.resultIndex) interim = t;
      }
      committedRef.current = committed;
      setLiveTranscript(joinParts(committed, interim));

      // After a final segment, wait for silence then send whole utterance
      if (committed.length >= 2) {
        clearSilenceTimer();
        silenceTimerRef.current = setTimeout(() => {
          const text = committedRef.current.trim();
          if (text.length >= 2 && activeRef.current) {
            void submitUtterance(text);
          }
        }, silenceMs);
      }
    };

    rec.onerror = (ev) => {
      const code = ev.error || '';
      if (code === 'aborted' || code === 'no-speech') return;
      if (code === 'not-allowed') {
        setError('Tillåt mikrofon för röstläge.');
        stopAll();
        return;
      }
      // network etc. — try to continue if still active
      if (activeRef.current && phaseRef.current === 'listening') {
        setError(code === 'network' ? 'Nätverksfel — försöker igen…' : null);
      }
    };

    rec.onend = () => {
      recRef.current = null;
      // If still listening mode and active, restart recognition (Chrome drops after silence)
      if (
        activeRef.current &&
        phaseRef.current === 'listening' &&
        !sendingRef.current
      ) {
        setTimeout(() => {
          if (
            activeRef.current &&
            phaseRef.current === 'listening' &&
            !recRef.current
          ) {
            startListenRef.current?.();
          }
        }, 300);
      }
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunde inte starta mikrofon');
      setPhaseBoth('idle');
    }
  }, [abortRec, lang, silenceMs, stopAll, submitUtterance, tts]);

  startListenRef.current = startListen;

  const start = useCallback(() => {
    if (!supported) {
      setError('Röstläge kräver Chrome eller Edge.');
      return;
    }
    activeRef.current = true;
    setActive(true);
    setError(null);
    startListen();
  }, [supported, startListen]);

  const stop = useCallback(() => {
    stopAll();
  }, [stopAll]);

  // External disable
  useEffect(() => {
    if (!opts.enabled && activeRef.current) stopAll();
  }, [opts.enabled, stopAll]);

  useEffect(() => {
    return () => stopAll();
  }, [stopAll]);

  return {
    supported,
    active,
    phase,
    liveTranscript,
    error,
    ttsSupported: tts.supported,
    speaking: tts.speaking,
    start,
    stop,
  };
}
