import { useCallback, useEffect, useRef, useState } from 'react';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import {
  mergeCommittedAndInterim,
  transcriptFromSpeechResults,
  type SpeechResultRow,
} from '@/lib/speechTranscript';

export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking';

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

export type VoiceModeOptions = {
  lang?: string;
  /** After last speech activity, wait this long before auto-send (ms) */
  silenceMs?: number;
  /** Pause after TTS before mic opens again (avoid hearing own voice) */
  postSpeakMs?: number;
  /** Called with user utterance — should send chat and return assistant text */
  onUserUtterance: (text: string) => Promise<string | null>;
  enabled: boolean;
  isBusy?: boolean;
};

/**
 * Conversational voice loop: listen → auto-send → speak reply → listen again.
 */
export function useJarvisVoiceMode(opts: VoiceModeOptions) {
  const lang = opts.lang || 'sv-SE';
  const silenceMs = opts.silenceMs ?? 1600;
  const postSpeakMs = opts.postSpeakMs ?? 900;
  const [supported] = useState(() => Boolean(getRecognitionCtor()));
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tts = useTextToSpeech();
  const speakRef = useRef(tts.speak);
  const stopTtsRef = useRef(tts.stop);
  const unlockTtsRef = useRef(tts.unlock);
  speakRef.current = tts.speak;
  stopTtsRef.current = tts.stop;
  unlockTtsRef.current = tts.unlock;

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const phaseRef = useRef<VoicePhase>('idle');
  /** Text from previous recognition sessions in this turn (Chrome onend restarts). */
  const carryRef = useRef('');
  /** Last stable/full transcript for this turn (committed + interim). */
  const lastFullRef = useRef('');
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postSpeakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendingRef = useRef(false);
  /** Ignore recognition briefly after TTS (echo / barge noise). */
  const ignoreUntilRef = useRef(0);
  const onUtteranceRef = useRef(opts.onUserUtterance);
  const busyRef = useRef(opts.isBusy);
  const startListenRef = useRef<((opts?: { fresh?: boolean }) => void) | null>(
    null,
  );

  useEffect(() => {
    onUtteranceRef.current = opts.onUserUtterance;
  }, [opts.onUserUtterance]);
  useEffect(() => {
    busyRef.current = opts.isBusy;
  }, [opts.isBusy]);

  const setPhaseBoth = useCallback((p: VoicePhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const clearPostSpeakTimer = useCallback(() => {
    if (postSpeakTimerRef.current) {
      clearTimeout(postSpeakTimerRef.current);
      postSpeakTimerRef.current = null;
    }
  }, []);

  const abortRec = useCallback(() => {
    clearSilenceTimer();
    clearRestartTimer();
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }
    recRef.current = null;
  }, [clearSilenceTimer, clearRestartTimer]);

  const stopAll = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    clearPostSpeakTimer();
    abortRec();
    stopTtsRef.current();
    setLiveTranscript('');
    carryRef.current = '';
    lastFullRef.current = '';
    sendingRef.current = false;
    ignoreUntilRef.current = 0;
    setPhaseBoth('idle');
  }, [abortRec, clearPostSpeakTimer, setPhaseBoth]);

  const submitUtterance = useCallback(
    async (text: string) => {
      const clean = text.replace(/\s+/g, ' ').trim();
      if (!clean || clean.length < 2) return;
      if (sendingRef.current || !activeRef.current) return;

      sendingRef.current = true;
      clearPostSpeakTimer();
      abortRec();
      setLiveTranscript('');
      carryRef.current = '';
      lastFullRef.current = '';
      setPhaseBoth('thinking');

      try {
        const reply = await onUtteranceRef.current(clean);
        if (!activeRef.current) return;

        if (reply?.trim()) {
          setPhaseBoth('speaking');
          speakRef.current(reply, () => {
            if (!activeRef.current) return;
            // Cooldown so TTS echo is not transcribed as user speech
            ignoreUntilRef.current = Date.now() + postSpeakMs + 400;
            clearPostSpeakTimer();
            postSpeakTimerRef.current = setTimeout(() => {
              if (activeRef.current && !busyRef.current && !sendingRef.current) {
                startListenRef.current?.({ fresh: true });
              }
            }, postSpeakMs);
          });
        } else {
          startListenRef.current?.({ fresh: true });
        }
      } catch {
        if (activeRef.current) {
          setError('Kunde inte få svar från Jarvis.');
          startListenRef.current?.({ fresh: true });
        }
      } finally {
        sendingRef.current = false;
      }
    },
    [abortRec, clearPostSpeakTimer, postSpeakMs, setPhaseBoth],
  );

  const armSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      if (!activeRef.current || phaseRef.current !== 'listening') return;
      if (sendingRef.current) return;
      if (Date.now() < ignoreUntilRef.current) return;
      const text = lastFullRef.current.trim();
      if (text.length >= 2) {
        void submitUtterance(text);
      }
    }, silenceMs);
  }, [clearSilenceTimer, silenceMs, submitUtterance]);

  const startListen = useCallback(
    (listenOpts?: { fresh?: boolean }) => {
      if (!activeRef.current) return;
      if (busyRef.current || sendingRef.current) return;
      if (phaseRef.current === 'speaking') stopTtsRef.current();

      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        setError('Röst stöds inte — prova Chrome eller Edge.');
        stopAll();
        return;
      }

      // Preserve partial utterance when Chrome drops the session mid-phrase
      if (listenOpts?.fresh) {
        carryRef.current = '';
        lastFullRef.current = '';
        setLiveTranscript('');
      } else if (lastFullRef.current) {
        // Keep what we already heard (includes last interim)
        carryRef.current = lastFullRef.current;
      }

      abortRec();
      setError(null);
      setPhaseBoth('listening');

      // Re-arm silence after session restart so partial text still auto-sends
      if (!listenOpts?.fresh && lastFullRef.current.trim().length >= 2) {
        armSilenceTimer();
      }

      const rec = new Ctor();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (ev) => {
        if (!activeRef.current || phaseRef.current !== 'listening') return;
        if (Date.now() < ignoreUntilRef.current) return;

        const { full: sessionFull } = transcriptFromSpeechResults(
          ev.results,
          ev.resultIndex,
        );
        // Collapse progressive re-hypothesis across session restarts (not naive join)
        const display = mergeCommittedAndInterim(
          carryRef.current,
          sessionFull,
        );
        if (!display) return;

        lastFullRef.current = display;
        setLiveTranscript(display);
        // Any speech activity (interim or final) resets silence → then auto-send
        armSilenceTimer();
      };

      rec.onerror = (ev) => {
        const code = ev.error || '';
        if (code === 'aborted' || code === 'no-speech') return;
        if (code === 'not-allowed') {
          setError('Tillåt mikrofon för röstläge.');
          stopAll();
          return;
        }
        if (activeRef.current && phaseRef.current === 'listening') {
          setError(code === 'network' ? 'Nätverksfel — försöker igen…' : null);
        }
      };

      rec.onend = () => {
        recRef.current = null;
        if (
          activeRef.current &&
          phaseRef.current === 'listening' &&
          !sendingRef.current
        ) {
          clearRestartTimer();
          restartTimerRef.current = setTimeout(() => {
            if (
              activeRef.current &&
              phaseRef.current === 'listening' &&
              !recRef.current &&
              !sendingRef.current
            ) {
              // Restart without wiping partial phrase
              startListenRef.current?.({ fresh: false });
            }
          }, 280);
        }
      };

      recRef.current = rec;
      try {
        rec.start();
      } catch (e) {
        // InvalidStateError if already started — ignore and retry once
        const msg = e instanceof Error ? e.message : String(e);
        if (/invalid state|already started/i.test(msg)) {
          clearRestartTimer();
          restartTimerRef.current = setTimeout(() => {
            if (activeRef.current && phaseRef.current === 'listening') {
              startListenRef.current?.({ fresh: listenOpts?.fresh ?? false });
            }
          }, 350);
          return;
        }
        setError(e instanceof Error ? e.message : 'Kunde inte starta mikrofon');
        setPhaseBoth('idle');
      }
    },
    [
      abortRec,
      armSilenceTimer,
      clearRestartTimer,
      lang,
      setPhaseBoth,
      stopAll,
    ],
  );

  startListenRef.current = startListen;

  const start = useCallback(() => {
    if (!supported) {
      setError('Röstläge kräver Chrome eller Edge.');
      return;
    }
    activeRef.current = true;
    setActive(true);
    setError(null);
    ignoreUntilRef.current = 0;
    unlockTtsRef.current();
    startListen({ fresh: true });
  }, [supported, startListen]);

  const stop = useCallback(() => {
    stopAll();
  }, [stopAll]);

  // External disable (offline / dialog closed)
  useEffect(() => {
    if (!opts.enabled && activeRef.current) stopAll();
  }, [opts.enabled, stopAll]);

  // Mount cleanup only — stopAll is stable enough via refs; do not re-run on each render
  useEffect(() => {
    return () => {
      activeRef.current = false;
      clearSilenceTimer();
      clearRestartTimer();
      clearPostSpeakTimer();
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
      recRef.current = null;
      try {
        stopTtsRef.current();
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
  }, []);

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
