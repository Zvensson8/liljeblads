import { Mic, Radio, Loader2, Volume2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VoicePhase } from '@/hooks/useJarvisVoiceMode';

const phaseLabel: Record<VoicePhase, string> = {
  idle: 'Röstläge av',
  listening: 'Lyssnar… prata nu',
  thinking: 'Tänker…',
  speaking: 'Jarvis pratar…',
};

const phaseHint: Record<VoicePhase, string> = {
  idle: 'Tryck för samtal med Ara (Grok Voice). Säg t.ex. “Hur ligger asfalteringen på Hjulet?”',
  listening: 'Lyssnar live — prata normalt. Pausa så svarar hon. Tryck stopp för att lägga på.',
  thinking: 'Kollar i systemet…',
  speaking: 'Prata när som helst för att avbryta.',
};

export default function JarvisVoicePanel({
  supported,
  active,
  phase,
  liveTranscript,
  error,
  onToggle,
  compact,
}: {
  supported: boolean;
  active: boolean;
  phase: VoicePhase;
  liveTranscript: string;
  error: string | null;
  onToggle: () => void;
  compact?: boolean;
}) {
  if (!supported) {
    return (
      <p className={cn('text-xs text-muted-foreground', compact && 'px-1')}>
        Röstsamtal kräver Chrome eller Edge med mikrofon.
      </p>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border bg-gradient-to-b from-primary/10 to-background',
        compact ? 'p-3' : 'p-4',
      )}
      data-testid="jarvis-voice-panel"
      data-phase={phase}
      data-active={active ? 'true' : 'false'}
    >
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size={compact ? 'default' : 'lg'}
          variant={active ? 'default' : 'secondary'}
          className={cn(
            'rounded-full h-14 w-14 shrink-0 shadow-md transition-transform',
            phase === 'listening' && 'ring-4 ring-primary/30 scale-105',
            phase === 'speaking' && 'ring-4 ring-emerald-500/30',
            phase === 'thinking' && 'opacity-90',
          )}
          onClick={onToggle}
          aria-label={
            active ? 'Avsluta röstsamtal' : 'Starta röstsamtal med Jarvis'
          }
          title={active ? 'Avsluta röstsamtal' : 'Starta röstsamtal med Jarvis'}
        >
          {phase === 'thinking' ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : phase === 'speaking' ? (
            <Volume2 className="h-6 w-6" />
          ) : active ? (
            <Square className="h-5 w-5" />
          ) : (
            <Radio className="h-6 w-6" />
          )}
        </Button>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm flex items-center gap-1.5">
            {phase === 'listening' && (
              <Mic className="h-3.5 w-3.5 text-primary animate-pulse" />
            )}
            {phaseLabel[phase]}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {phaseHint[phase]}
          </p>
        </div>
      </div>

      {liveTranscript && (phase === 'listening' || phase === 'speaking') && (
        <p
          className="mt-3 text-sm rounded-lg bg-muted/80 px-3 py-2 border border-border/50"
          data-testid="jarvis-voice-transcript"
        >
          <span className="text-muted-foreground text-xs block mb-0.5">
            Du säger
          </span>
          {liveTranscript}
        </p>
      )}

      {error && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
