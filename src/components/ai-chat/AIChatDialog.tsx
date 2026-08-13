import { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, Bot, User, MapPin, Mic, MicOff, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useAIChat } from '@/hooks/useEdgeFunctions';
import { useJarvisPageContext } from '@/hooks/useJarvisPageContext';
import JarvisActionCards, {
  type JarvisAppliedAction,
} from '@/components/ai-chat/JarvisActionCards';
import { mergeAppliedActions } from '@/lib/jarvisActionFromMessage';
import JarvisRecentActions from '@/components/ai-chat/JarvisRecentActions';
import JarvisVoicePanel from '@/components/ai-chat/JarvisVoicePanel';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useOrgRole } from '@/hooks/useOrgRole';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { useGrokVoiceAgent } from '@/hooks/useGrokVoiceAgent';
import { toast } from 'sonner';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  appliedActions?: JarvisAppliedAction[];
}

interface AIChatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AIChatDialog({ open, onOpenChange }: AIChatDialogProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastApplied, setLastApplied] = useState<JarvisAppliedAction[] | null>(null);
  const [showLog, setShowLog] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const aiChat = useAIChat();
  const pageContext = useJarvisPageContext();
  const isOnline = useOnlineStatus();
  const { canWrite, isViewer, roleLabel } = useOrgRole();
  const speech = useSpeechToText({ lang: 'sv-SE' });

  const hasPageEntity =
    Boolean(pageContext.property_id) ||
    Boolean(pageContext.project_id) ||
    Boolean(pageContext.component_id);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, lastApplied]);

  const sendMessage = async (
    overrideText?: string,
    opts?: { voice?: boolean },
  ): Promise<string | null> => {
    const content = (overrideText ?? input).trim();
    if (!content || isLoading) return null;

    if (!isOnline) {
      toast.warning('Du är offline', {
        description: 'Jarvis kan inte köra apply. Vänta tills du är online.',
      });
      return null;
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const raw = await aiChat.mutateAsync({
        messages: [...messages, userMessage].map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stream: false,
        pageContext: {
          property_id: pageContext.property_id,
          project_id: pageContext.project_id,
          component_id: pageContext.component_id,
          path: pageContext.path,
          label: pageContext.label,
        },
        voice: opts?.voice === true,
      });

      // supabase.functions.invoke sometimes nests body; unwrap common shapes
      const data = (raw && typeof raw === 'object' && 'message' in (raw as object)
        ? raw
        : (raw as { data?: unknown })?.data &&
            typeof (raw as { data?: unknown }).data === 'object'
          ? (raw as { data: object }).data
          : raw) as {
        message?: string;
        suggestedActions?: unknown[];
        appliedActions?: JarvisAppliedAction[];
        toolsUsed?: string[];
      } | null;

      const messageText =
        data?.message || 'Jag kunde inte generera ett svar just nu.';
      const applied = mergeAppliedActions(
        data?.appliedActions,
        messageText,
        data?.toolsUsed || [],
      );

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: messageText,
        appliedActions: applied,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      if (applied.length) setLastApplied(applied);
      return messageText;
    } catch (error: unknown) {
      const err = error as { context?: { status?: number }; status?: number } | null;
      const status = err?.context?.status ?? err?.status;
      if (status === 401) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Din session har gått ut. Logga in igen och försök på nytt.',
          },
        ]);
        return null;
      }

      console.error('AI chat error:', error);
      const fail = 'Ett fel uppstod. Försök igen.';
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: fail,
        },
      ]);
      return fail;
    } finally {
      setIsLoading(false);
    }
  };

  const voice = useGrokVoiceAgent({
    enabled: open && isOnline,
    pageLabel: pageContext.label,
    pageContext: {
      property_id: pageContext.property_id,
      project_id: pageContext.project_id,
      component_id: pageContext.component_id,
      path: pageContext.path,
    },
    onTurn: ({ role, text }) => {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role, content: text },
      ]);
    },
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-3rem)] rounded-xl border bg-background shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-200 flex flex-col max-h-[min(90vh,640px)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 shrink-0">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm">Jarvis</h3>
            {hasPageEntity ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0" />
                Ser {pageContext.label || 'sidan'}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {isViewer ? `Läge: ${roleLabel} (endast läs)` : 'Fråga mig vad som helst'}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!isOnline && (
            <span className="text-[10px] text-amber-600 flex items-center gap-0.5 mr-1">
              <WifiOff className="h-3 w-3" /> Offline
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-[280px] p-4" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-10">
            <Bot className="h-12 w-12 mb-3 opacity-50" />
            <p className="text-sm">Hej! Hur kan jag hjälpa dig idag?</p>
            <p className="text-xs mt-1">
              {hasPageEntity
                ? 'Jag ser vilken sida du är på — fråga om "denna" fastighet/projekt.'
                : 'Ställ en fråga om dina fastigheter, projekt eller komponenter.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className="space-y-2">
                <div
                  className={cn(
                    'flex gap-3',
                    message.role === 'user' && 'flex-row-reverse',
                  )}
                >
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted',
                    )}
                  >
                    {message.role === 'user' ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                  </div>
                  <div
                    className={cn(
                      'rounded-lg px-3 py-2 text-sm max-w-[85%]',
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted',
                    )}
                  >
                    <div className="whitespace-pre-wrap break-words">{message.content}</div>
                  </div>
                </div>
                {/* Cards OUTSIDE bubble so they are never clipped / hard to see */}
                {message.role === 'assistant' &&
                  message.appliedActions &&
                  message.appliedActions.length > 0 && (
                    <div className="pl-11">
                      <JarvisActionCards actions={message.appliedActions} />
                    </div>
                  )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-lg px-3 py-2 bg-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {lastApplied && lastApplied.length > 0 && (
        <div className="border-t border-emerald-500/30 bg-emerald-500/5 px-3 py-2 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-medium text-emerald-800 dark:text-emerald-200">
              Senaste åtgärd
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-2"
              onClick={() => setLastApplied(null)}
            >
              Stäng
            </Button>
          </div>
          <JarvisActionCards actions={lastApplied} />
        </div>
      )}

      {showLog && (
        <div className="border-t max-h-48 overflow-y-auto px-2 py-2 shrink-0 bg-muted/20">
          <JarvisRecentActions />
        </div>
      )}

      {/* Input */}
      <div className="border-t p-3 shrink-0 space-y-2">
        {isOnline && (
          <JarvisVoicePanel
            compact
            supported={voice.supported}
            active={voice.active}
            phase={voice.phase}
            liveTranscript={voice.liveTranscript}
            error={voice.error}
            onToggle={() => (voice.active ? voice.stop() : voice.start())}
          />
        )}
        {!canWrite && (
          <p className="text-[10px] text-muted-foreground mb-1.5">
            Din roll ({roleLabel}) är läs-only — Jarvis apply blockeras i backend/UI.
          </p>
        )}
        {speech.error && (
          <p className="text-[10px] text-destructive mb-1">{speech.error}</p>
        )}
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !isOnline
                ? 'Offline — endast lokal text…'
                : speech.listening
                  ? 'Lyssnar…'
                  : 'Skriv eller diktera…'
            }
            disabled={isLoading}
            className="flex-1"
          />
          {speech.supported && (
            <Button
              type="button"
              variant={speech.listening ? 'default' : 'outline'}
              size="icon"
              className="shrink-0"
              disabled={isLoading}
              title="Röstinmatning (svenska)"
              onClick={() => {
                if (speech.listening) {
                  speech.stop();
                  return;
                }
                // Pass current input as base; updates replace interim (no stacking)
                speech.start(input, (text) => setInput(text));
              }}
            >
              {speech.listening ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 text-[11px] px-2"
            onClick={() => setShowLog((v) => !v)}
            title="Visa senaste åtgärder"
          >
            Logg
          </Button>
          <Button
            onClick={() => void sendMessage()}
            disabled={!input.trim() || isLoading || !isOnline}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
