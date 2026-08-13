import { useCallback, useEffect, useRef, useState } from 'react';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { textForSpeech } from '@/lib/textForSpeech';
import {
  looksLikeTtsEcho,
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
  onUserUtterance: (text: string) => Promise<string | null>;
  enabled: boolean;
  isBusy?: boolean;
};

type ListenMode = 'turn' | 'barge';

/**
 * Conversational voice loop with barge-in:
 * listen → auto-send → speak → (user can interrupt) → listen.
 */
export function useJarvisVoiceMode(opts: VoiceModeOptions) {
  const lang = opts.lang || 'sv-SE';
  const silenceMs = opts.silenceMs ?? 1100;
  const postSpeakMs = opts.postSpeakMs ?? 450;
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
  const listenModeRef = useRef<ListenMode>('turn');
  const carryRef = useRef('');
  const lastFullRef = useRef('');
  const lastSpokenRef = useRef('');
  const audioStartedRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const postSpeakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendingRef = useRef(false);
  const ignoreUntilRef = useRef(0);
  const onUtteranceRef = useRef(opts.onUserUtterance);
  const busyRef = useRef(opts.isBusy);
  const startListenRef = useRef<
    ((opts?: { fresh?: boolean; mode?: ListenMode }) => void) | null
  >(null);

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
    lastSpokenRef.current = '';
    audioStartedRef.current = false;
    sendingRef.current = false;
    ignoreUntilRef.current = 0;
    listenModeRef.current = 'turn';
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
      lastSpokenRef.current = '';
      audioStartedRef.current = false;
      setPhaseBoth('thinking');

      try {
        const reply = await onUtteranceRef.current(clean);
        if (!activeRef.current) return;

        if (reply?.trim()) {
          sendingRef.current = false;
          const spoken = textForSpeech(reply);
          lastSpokenRef.current = spoken;
          audioStartedRef.current = false;
          setPhaseBoth('speaking');
          speakRef.current(reply, {
            onStart: () => {
              audioStartedRef.current = true;
            },
            onEnd: () => {
              if (!activeRef.current) return;
              if (phaseRef.current !== 'speaking') return;
              lastSpokenRef.current = '';
              audioStartedRef.current = false;
              ignoreUntilRef.current = Date.now() + postSpeakMs + 250;
              clearPostSpeakTimer();
              postSpeakTimerRef.current = setTimeout(() => {
                if (
                  activeRef.current &&
                  !busyRef.current &&
                  !sendingRef.current &&
                  phaseRef.current === 'speaking'
                ) {
                  startListenRef.current?.({ fresh: true, mode: 'turn' });
                }
              }, postSpeakMs);
            },
          });
          // Mic stays open so the user can interrupt (even while TTS loads)
          startListenRef.current?.({ fresh: true, mode: 'barge' });
        } else {
          startListenRef.current?.({ fresh: true, mode: 'turn' });
        }
      } catch {
        if (activeRef.current) {
          setError('Kunde inte få svar från Jarvis.');
          startListenRef.current?.({ fresh: true, mode: 'turn' });
        }
      } finally {
        sendingRef.current = false;
      }
    },
    [abortRec, clearPostSpeakTimer, postSpeakMs, setPhaseBoth],
  );

  const bargeIn = useCallback(
    (heard: string) => {
      const clean = heard.replace(/\s+/g, ' ').trim();
      if (!clean) return;
      listenModeRef.current = 'turn';
      setPhaseBoth('listening');
      stopTtsRef.current();
      clearPostSpeakTimer();
      lastSpokenRef.current = '';
      audioStartedRef.current = false;
      ignoreUntilRef.current = 0;
      carryRef.current = clean;
      lastFullRef.current = clean;
      setLiveTranscript(clean);
      // Let them finish the interrupting sentence
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      silenceTimerRef.current = setTimeout(() => {
        if (!activeRef.current || phaseRef.current !== 'listening') return;
        if (sendingRef.current) return;
        const text = lastFullRef.current.trim();
        if (text.length >= 2) void submitUtterance(text);
      }, Math.min(silenceMs, 900));
    },
    [clearPostSpeakTimer, setPhaseBoth, silenceMs, submitUtterance],
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
    (listenOpts?: { fresh?: boolean; mode?: ListenMode }) => {
      if (!activeRef.current) return;
      if (sendingRef.current) return;
      const mode: ListenMode = listenOpts?.mode || 'turn';
      // isLoading lags one render after the reply — still allow barge-in
      if (busyRef.current && mode !== 'barge') return;
      listenModeRef.current = mode;

      if (phaseRef.current === 'speaking' && mode !== 'barge') {
        stopTtsRef.current();
      }

      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        setError('Röst stöds inte — prova Chrome eller Edge.');
        stopAll();
        return;
      }

      if (listenOpts?.fresh) {
        carryRef.current = '';
        lastFullRef.current = '';
        setLiveTranscript('');
      } else if (lastFullRef.current) {
        carryRef.current = lastFullRef.current;
      }

      abortRec();
      setError(null);
      if (mode === 'turn') setPhaseBoth('listening');

      if (
        mode === 'turn' &&
        !listenOpts?.fresh &&
        lastFullRef.current.trim().length >= 2
      ) {
        armSilenceTimer();
      }

      const rec = new Ctor();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (ev) => {
        if (!activeRef.current) return;
        if (Date.now() < ignoreUntilRef.current) return;

        const { full: sessionFull } = transcriptFromSpeechResults(
          ev.results,
          ev.resultIndex,
        );
        const display = mergeCommittedAndInterim(
          carryRef.current,
          sessionFull,
        );
        if (!display) return;

        const barging =
          listenModeRef.current === 'barge' || phaseRef.current === 'speaking';
        if (barging) {
          const compact = display.replace(/\s+/g, '');
          if (!audioStartedRef.current) {
            if (compact.length >= 4) bargeIn(display);
            return;
          }
          if (looksLikeTtsEcho(display, lastSpokenRef.current)) return;
          if (compact.length < 5) return;
          bargeIn(display);
          return;
        }

        if (phaseRef.current !== 'listening') return;
        lastFullRef.current = display;
        setLiveTranscript(display);
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
        if (!activeRef.current || sendingRef.current) return;
        if (
          phaseRef.current !== 'listening' &&
          listenModeRef.current !== 'barge'
        ) {
          return;
        }
        clearRestartTimer();
        restartTimerRef.current = setTimeout(() => {
          if (
            activeRef.current &&
            !recRef.current &&
            !sendingRef.current &&
            (phaseRef.current === 'listening' ||
              phaseRef.current === 'speaking')
          ) {
            startListenRef.current?.({
              fresh: false,
              mode: listenModeRef.current,
            });
          }
        }, 280);
      };

      recRef.current = rec;
      try {
        rec.start();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/invalid state|already started/i.test(msg)) {
          clearRestartTimer();
          restartTimerRef.current = setTimeout(() => {
            if (activeRef.current) {
              startListenRef.current?.({
                fresh: listenOpts?.fresh ?? false,
                mode,
              });
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
      bargeIn,
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
    startListen({ fresh: true, mode: 'turn' });
  }, [supported, startListen]);

  const stop = useCallback(() => {
    stopAll();
  }, [stopAll]);

  useEffect(() => {
    if (!opts.enabled && activeRef.current) stopAll();
  }, [opts.enabled, stopAll]);

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
