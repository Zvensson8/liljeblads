import { useNavigate } from 'react-router-dom';
import { Phone, MessageSquare, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import JarvisVoicePanel from '@/components/ai-chat/JarvisVoicePanel';
import { useGrokVoiceAgent } from '@/hooks/useGrokVoiceAgent';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { usePrataHomeScreen } from '@/hooks/usePrataHomeScreen';

/** Full-screen voice — add to phone home screen as “Jarvis”. */
export default function Prata() {
  usePrataHomeScreen();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const voice = useGrokVoiceAgent({
    enabled: isOnline,
    pageLabel: 'Telefon / Prata',
  });

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-primary/15 via-background to-background flex flex-col px-5 py-6">
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
            <Phone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold leading-tight">Jarvis</p>
            <p className="text-xs text-muted-foreground">Prata som med en kollega</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/jarvis')}
          className="text-muted-foreground"
        >
          <MessageSquare className="h-4 w-4 mr-1" />
          Chatt
        </Button>
      </header>

      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        {!isOnline ? (
          <p className="text-center text-sm text-amber-600">
            Du är offline — röstsamtal kräver nät.
          </p>
        ) : (
          <JarvisVoicePanel
            supported={voice.supported}
            active={voice.active}
            phase={voice.phase}
            liveTranscript={voice.liveTranscript}
            error={voice.error}
            onToggle={() => (voice.active ? voice.stop() : voice.start())}
          />
        )}
      </div>

      <footer className="mt-8 space-y-3 text-center text-xs text-muted-foreground max-w-md mx-auto">
        <p className="flex items-center justify-center gap-1.5">
          <Share className="h-3.5 w-3.5" />
          Gör det härifrån: iPhone Dela → Lägg till på hemskärmen. Android: Installera app.
          Ta bort den gamla ikonen först om den öppnade startsidan.
        </p>
        <p>
          Telefonnummer (ring in) sätts i xAI Voice Agent Builder och kopplas mot
          Jarvis MCP — se docs/JARVIS_PHONE.md
        </p>
      </footer>
    </div>
  );
}
