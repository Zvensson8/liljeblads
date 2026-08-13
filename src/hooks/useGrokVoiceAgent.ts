import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { env, functionsUrl } from '@/lib/env';
import { float32ToPcm16Base64, pcm16Base64ToFloat32 } from '@/lib/pcmAudio';
import type { VoicePhase } from '@/hooks/useJarvisVoiceMode';

const SAMPLE_RATE = 24000;
const REALTIME_URL = 'wss://api.x.ai/v1/realtime';

type VoiceSessionPayload = {
  client_secret: string;
  model?: string;
  voice?: string;
  instructions?: string;
  tools?: unknown[];
  keyterms?: string[];
  error?: string;
};

export type VoiceAgentOptions = {
  enabled: boolean;
  pageLabel?: string | null;
  pageContext?: {
    property_id?: string;
    project_id?: string;
    component_id?: string;
    path?: string;
  } | null;
  onTurn?: (turn: { role: 'user' | 'assistant'; text: string }) => void;
};

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    apikey: env.supabasePublishableKey,
    'Content-Type': 'application/json',
  };
}

export function useGrokVoiceAgent(opts: VoiceAgentOptions) {
  const [supported] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof AudioContext !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia,
  );
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextPlayRef = useRef(0);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const activeRef = useRef(false);
  const pendingFnsRef = useRef(0);
  const assistantBufRef = useRef('');
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const setPhaseSafe = useCallback((p: VoicePhase) => {
    if (activeRef.current || p === 'idle') setPhase(p);
  }, []);

  const stopPlayback = useCallback(() => {
    for (const s of sourcesRef.current) {
      try {
        s.stop();
      } catch {
        /* ignore */
      }
    }
    sourcesRef.current = [];
    nextPlayRef.current = 0;
  }, []);

  const playPcm = useCallback((b64: string) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const samples = pcm16Base64ToFloat32(b64);
    if (!samples.length) return;
    const buf = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
    buf.getChannelData(0).set(samples);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const now = ctx.currentTime;
    if (nextPlayRef.current < now + 0.02) nextPlayRef.current = now;
    src.start(nextPlayRef.current);
    nextPlayRef.current += buf.duration;
    sourcesRef.current.push(src);
    src.onended = () => {
      sourcesRef.current = sourcesRef.current.filter((x) => x !== src);
    };
  }, []);

  const teardown = useCallback(() => {
    activeRef.current = false;
    try {
      wsRef.current?.close();
    } catch {
      /* ignore */
    }
    wsRef.current = null;
    stopPlayback();
    try {
      processorRef.current?.disconnect();
      sourceRef.current?.disconnect();
    } catch {
      /* ignore */
    }
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (ctxRef.current) {
      void ctxRef.current.close().catch(() => undefined);
      ctxRef.current = null;
    }
    setActive(false);
    setPhase('idle');
    setLiveTranscript('');
  }, [stopPlayback]);

  const runTool = useCallback(async (name: string, args: string, callId: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    pendingFnsRef.current += 1;
    setPhaseSafe('thinking');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('no-session');
      const res = await fetch(functionsUrl('jarvis-voice-tool'), {
        method: 'POST',
        headers: authHeaders(session.access_token),
        body: JSON.stringify({
          name,
          arguments: args,
          pageContext: optsRef.current.pageContext ?? null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      const output = JSON.stringify(payload.result ?? payload).slice(0, 8000);
      ws.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output,
          },
        }),
      );
    } catch (e) {
      ws.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify({
              error: e instanceof Error ? e.message : 'tool failed',
            }),
          },
        }),
      );
    } finally {
      pendingFnsRef.current = Math.max(0, pendingFnsRef.current - 1);
      if (pendingFnsRef.current === 0 && wsRef.current?.readyState === WebSocket.OPEN) {
        window.setTimeout(() => {
          if (
            pendingFnsRef.current === 0 &&
            wsRef.current?.readyState === WebSocket.OPEN
          ) {
            wsRef.current.send(JSON.stringify({ type: 'response.create' }));
          }
        }, 40);
      }
    }
  }, [setPhaseSafe]);

  const handleEvent = useCallback(
    (event: Record<string, unknown>) => {
      const type = String(event.type || '');
      if (type === 'input_audio_buffer.speech_started') {
        stopPlayback();
        setPhaseSafe('listening');
        return;
      }
      if (type === 'input_audio_buffer.speech_stopped') {
        setPhaseSafe('thinking');
        return;
      }
      if (
        type === 'conversation.item.input_audio_transcription.completed' ||
        type === 'conversation.item.input_audio_transcription.done'
      ) {
        const text = String(
          event.transcript ||
            (event.item as { content?: Array<{ transcript?: string }> } | undefined)
              ?.content?.[0]?.transcript ||
            '',
        ).trim();
        if (text) {
          setLiveTranscript(text);
          optsRef.current.onTurn?.({ role: 'user', text });
        }
        return;
      }
      if (
        type === 'response.output_audio_transcript.delta' ||
        type === 'response.audio_transcript.delta'
      ) {
        const delta = String(event.delta || '');
        if (delta) {
          assistantBufRef.current += delta;
          setLiveTranscript(assistantBufRef.current);
        }
        return;
      }
      if (
        type === 'response.output_audio.delta' ||
        type === 'response.audio.delta'
      ) {
        const delta = String(event.delta || '');
        if (delta) {
          setPhaseSafe('speaking');
          playPcm(delta);
        }
        return;
      }
      if (type === 'response.function_call_arguments.done') {
        const name = String(event.name || '');
        const callId = String(event.call_id || '');
        const args = String(event.arguments || '{}');
        if (name && callId) void runTool(name, args, callId);
        return;
      }
      if (type === 'response.done') {
        const spoken = assistantBufRef.current.trim();
        if (spoken) {
          optsRef.current.onTurn?.({ role: 'assistant', text: spoken });
        }
        assistantBufRef.current = '';
        if (pendingFnsRef.current === 0) setPhaseSafe('listening');
        return;
      }
      if (type === 'error') {
        const msg =
          (event.error as { message?: string } | undefined)?.message ||
          String(event.message || 'Voice Agent-fel');
        setError(msg);
      }
    },
    [playPcm, runTool, setPhaseSafe, stopPlayback],
  );

  const start = useCallback(async () => {
    if (!supported || activeRef.current) return;
    if (!optsRef.current.enabled) {
      setError('Du är offline.');
      return;
    }
    setError(null);
    setLiveTranscript('');
    assistantBufRef.current = '';
    pendingFnsRef.current = 0;

    try {
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      if (ctx.state === 'suspended') await ctx.resume();
      ctxRef.current = ctx;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Logga in igen.');

      const bootRes = await fetch(functionsUrl('jarvis-voice-session'), {
        method: 'POST',
        headers: authHeaders(session.access_token),
        body: JSON.stringify({
          pageLabel: optsRef.current.pageLabel ?? null,
        }),
      });
      const boot = (await bootRes.json()) as VoiceSessionPayload;
      if (!bootRes.ok || !boot.client_secret) {
        throw new Error(boot.error || 'Kunde inte starta Grok Voice.');
      }

      const model = boot.model || 'grok-voice-latest';
      const ws = new WebSocket(`${REALTIME_URL}?model=${encodeURIComponent(model)}`, [
        `xai-client-secret.${boot.client_secret}`,
      ]);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              voice: boot.voice || 'ara',
              instructions: boot.instructions,
              reasoning: { effort: 'none' },
              turn_detection: {
                type: 'server_vad',
                threshold: 0.78,
                silence_duration_ms: 650,
                prefix_padding_ms: 280,
              },
              audio: {
                input: {
                  format: { type: 'audio/pcm', rate: SAMPLE_RATE },
                  transcription: {
                    language_hint: 'sv',
                    keyterms: boot.keyterms || [],
                  },
                },
                output: {
                  format: { type: 'audio/pcm', rate: SAMPLE_RATE },
                },
              },
              tools: boot.tools || [],
            },
          }),
        );

        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        const mute = ctx.createGain();
        mute.gain.value = 0;
        source.connect(processor);
        processor.connect(mute);
        mute.connect(ctx.destination);
        sourceRef.current = source;
        processorRef.current = processor;

        processor.onaudioprocess = (ev) => {
          if (!activeRef.current || ws.readyState !== WebSocket.OPEN) return;
          const input = ev.inputBuffer.getChannelData(0);
          ws.send(
            JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: float32ToPcm16Base64(input),
            }),
          );
        };

        activeRef.current = true;
        setActive(true);
        setPhaseSafe('listening');
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return;
        try {
          handleEvent(JSON.parse(ev.data) as Record<string, unknown>);
        } catch {
          /* ignore */
        }
      };

      ws.onerror = () => {
        setError('Tappade Voice Agent-anslutningen.');
      };
      ws.onclose = () => {
        if (activeRef.current) teardown();
      };
    } catch (e) {
      teardown();
      setError(e instanceof Error ? e.message : 'Kunde inte starta mikrofon/röst.');
    }
  }, [handleEvent, setPhaseSafe, supported, teardown]);

  const stop = useCallback(() => {
    teardown();
  }, [teardown]);

  useEffect(() => {
    if (!opts.enabled && activeRef.current) teardown();
  }, [opts.enabled, teardown]);

  useEffect(() => () => teardown(), [teardown]);

  return {
    supported,
    active,
    phase,
    liveTranscript,
    error,
    ttsSupported: true,
    speaking: phase === 'speaking',
    start,
    stop,
  };
}
