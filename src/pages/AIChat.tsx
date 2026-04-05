import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User, Plus, Trash2, MessageSquare, Menu, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

const suggestedQuestions = [
  "Ge mig en översikt av alla fastigheter",
  "Vilka arbetsordrar behöver åtgärdas?",
  "Sammanfatta underhållshistoriken",
  "Vad säger ABT 06 om beställarens ansvar?",
];

export default function AIChat() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch conversations
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery({
    queryKey: ['ai-conversations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_conversations')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as Conversation[];
    },
    enabled: !!user
  });

  // Fetch messages for selected conversation
  const { data: conversationMessages = [] } = useQuery({
    queryKey: ['ai-messages', selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return [];
      const { data, error } = await supabase
        .from('ai_messages')
        .select('*')
        .eq('conversation_id', selectedConversationId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Message[];
    },
    enabled: !!selectedConversationId,
    staleTime: 0,
  });

  useEffect(() => {
    if (!isLoading) {
      setMessages(conversationMessages);
    }
  }, [conversationMessages, isLoading]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const deleteConversationMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ai_conversations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
      if (selectedConversationId) {
        setSelectedConversationId(null);
        setMessages([]);
      }
      toast.success('Konversation borttagen');
    }
  });

  const updateTitleMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase.from('ai_conversations').update({ title }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
    }
  });

  const handleNewConversation = () => {
    setSelectedConversationId(null);
    setMessages([]);
    setSidebarOpen(false);
  };

  const selectConversation = async (id: string) => {
    setSelectedConversationId(id);
    setSidebarOpen(false);
    await queryClient.invalidateQueries({ queryKey: ['ai-messages', id] });
  };

  // Stream chat response
  const streamChatResponse = async (
    messagesToSend: { role: string; content: string }[],
    onDelta: (delta: string) => void,
    onDone: () => void
  ) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No session');

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ messages: messagesToSend, stream: true }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.startsWith(':') || line.trim() === '') continue;
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') { onDone(); return; }
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {
          buffer = line + '\n' + buffer;
          break;
        }
      }
    }

    if (buffer.trim()) {
      for (let raw of buffer.split('\n')) {
        if (!raw) continue;
        if (raw.endsWith('\r')) raw = raw.slice(0, -1);
        if (raw.startsWith(':') || raw.trim() === '') continue;
        if (!raw.startsWith('data: ')) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch { /* ignore */ }
      }
    }
    onDone();
  };

  const sendMessage = async (text?: string) => {
    const messageText = text || input;
    if (!messageText.trim() || isLoading || !user) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      let conversationId = selectedConversationId;

      if (!conversationId) {
        const words = userMessage.content.split(' ').slice(0, 4).join(' ');
        const title = words + (userMessage.content.split(' ').length > 4 ? '...' : '');
        const { data: newConv, error: convError } = await supabase
          .from('ai_conversations')
          .insert({ user_id: user.id, title })
          .select()
          .single();
        if (convError) throw convError;
        conversationId = newConv.id;
        setSelectedConversationId(conversationId);
        queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
      }

      await supabase.from('ai_messages').insert({
        conversation_id: conversationId,
        role: 'user',
        content: userMessage.content
      });

      const messagesToSend = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content
      }));

      let assistantContent = '';
      const assistantId = crypto.randomUUID();
      setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

      await streamChatResponse(
        messagesToSend,
        (delta) => {
          assistantContent += delta;
          setMessages(prev =>
            prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m)
          );
        },
        () => {}
      );

      if (assistantContent) {
        await supabase.from('ai_messages').insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: assistantContent
        });
      }

      if (messages.length === 0) {
        const words = userMessage.content.split(' ').slice(0, 4).join(' ');
        const title = words + (userMessage.content.split(' ').length > 4 ? '...' : '');
        updateTitleMutation.mutate({ id: conversationId, title });
      }
    } catch (error: any) {
      const status = error?.context?.status ?? error?.status;
      if (status === 401) {
        toast.error('Sessionen har gått ut. Logga in igen.');
        await supabase.auth.signOut();
        window.location.href = '/auth';
        return;
      }
      if (status === 429) toast.error('För många förfrågningar. Vänta en stund.');
      else if (status === 402) toast.error('Krediter slut.');
      else {
        console.error('AI chat error:', error);
        toast.error('Ett fel uppstod. Försök igen.');
      }
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Ett fel uppstod. Försök igen.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Parse follow-up suggestions from assistant messages
  const parseMessage = (content: string) => {
    const suggestions: string[] = [];
    const lastDivider = content.lastIndexOf("---");
    const mainContent = lastDivider > -1 ? content.substring(0, lastDivider).trimEnd() : content;
    const tailContent = lastDivider > -1 ? content.substring(lastDivider + 3).trim() : "";
    if (tailContent) {
      for (const line of tailContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const m = trimmed.match(/^(?:[-*]\s*)?(?:👉\s*)?(?:\[(.+?)\]|(\d+\.\s*)?(.+))$/);
        if (m) {
          const text = (m[1] || m[3] || "").replace(/^\*\*(.+)\*\*$/, "$1").replace(/^👉\s*/, "").replace(/\??\s*$/, "?").trim();
          if (text && text.length > 5 && text !== "---") suggestions.push(text);
        }
      }
    }
    return { mainContent: suggestions.length > 0 ? mainContent : content, suggestions };
  };

  const conversationListContent = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <Button onClick={handleNewConversation} className="w-full" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Ny konversation
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          {conversationsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Inga konversationer än</p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                role="button"
                tabIndex={0}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors select-none",
                  selectedConversationId === conv.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
                onClick={() => { setMessages([]); selectConversation(conv.id); }}
                onKeyDown={(e) => e.key === 'Enter' && selectConversation(conv.id)}
              >
                <MessageSquare className="h-4 w-4 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{conv.title}</p>
                  <p className={cn("text-xs", selectedConversationId === conv.id ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {format(new Date(conv.updated_at), 'd MMM', { locale: sv })}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-7 w-7 flex-shrink-0 opacity-100 transition-opacity",
                    selectedConversationId === conv.id ? "text-primary-foreground hover:bg-primary-foreground/20" : "hover:bg-destructive/10 hover:text-destructive"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Är du säker på att du vill ta bort denna konversation?')) {
                      deleteConversationMutation.mutate(conv.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return (
    <SidebarProvider>
      <div className="h-screen flex w-full bg-background overflow-hidden">
        <AppSidebar />
        <main className="flex-1 flex flex-col min-h-0">
          {/* Header */}
          <header className="h-14 border-b flex items-center justify-between px-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              {isMobile && (
                <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-72 p-0">
                    <ConversationList />
                  </SheetContent>
                </Sheet>
              )}
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h1 className="font-semibold">AI Assistent</h1>
                  <p className="text-xs text-muted-foreground hidden sm:block">Med kunskapsbas (ABT06, branschstandarder)</p>
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1 flex overflow-hidden">
            {/* Desktop conversation sidebar */}
            {!isMobile && (
              <aside className="w-72 border-r flex-shrink-0 bg-muted/30 min-h-0 overflow-hidden">
                <ConversationList />
              </aside>
            )}

            {/* Chat area */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-20">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 mb-6">
                      <Sparkles className="h-10 w-10 text-primary" />
                    </div>
                    <h2 className="text-xl font-medium mb-2 text-foreground">Hur kan jag hjälpa?</h2>
                    <p className="text-sm text-muted-foreground max-w-md mb-8">
                      Ställ frågor om dina fastigheter, komponenter, projekt, eller branschstandarder som ABT 06.
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 max-w-lg">
                      {suggestedQuestions.map((q) => (
                        <button
                          key={q}
                          onClick={() => sendMessage(q)}
                          className="flex items-start gap-2 rounded-lg border bg-card px-3 py-2.5 text-left text-xs text-muted-foreground hover:bg-muted transition-all duration-200 hover:-translate-y-[1px]"
                        >
                          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary/60" />
                          <span>{q}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto space-y-4">
                    {messages.map((message) => {
                      const { mainContent, suggestions } = message.role === 'assistant'
                        ? parseMessage(message.content)
                        : { mainContent: message.content, suggestions: [] };

                      return (
                        <div
                          key={message.id}
                          className={cn("flex gap-3", message.role === 'user' ? "justify-end" : "justify-start")}
                        >
                          {message.role === 'assistant' && (
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                              <Bot className="h-3.5 w-3.5 text-primary" />
                            </div>
                          )}
                          <div className={cn(
                            "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                            message.role === 'user'
                              ? "bg-primary text-primary-foreground"
                              : "bg-card border border-border/50 shadow-sm"
                          )}>
                            {message.role === 'assistant' ? (
                              <>
                                <div className="prose prose-sm dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_table]:my-3 [&_th]:bg-muted/70 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:border [&_th]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_td]:border [&_td]:border-border">
                                  <ReactMarkdown>{mainContent}</ReactMarkdown>
                                </div>
                                {suggestions.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-border/50 pt-2">
                                    {suggestions.map((s, idx) => (
                                      <button
                                        key={idx}
                                        onClick={() => sendMessage(s)}
                                        disabled={isLoading}
                                        className="flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted transition-all duration-200 hover:-translate-y-[1px] disabled:opacity-50"
                                      >
                                        <Sparkles className="h-2.5 w-2.5 text-primary/50" />
                                        {s}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </>
                            ) : (
                              <p>{message.content}</p>
                            )}
                          </div>
                          {message.role === 'user' && (
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <User className="h-3.5 w-3.5" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {isLoading && messages[messages.length - 1]?.role === 'user' && (
                      <div className="flex gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Bot className="h-3.5 w-3.5 text-primary" />
                        </div>
                        <div className="rounded-2xl bg-card border border-border/50 px-4 py-3 shadow-sm">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm text-muted-foreground">Tänker...</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="border-t p-4 bg-background">
                <div className="max-w-3xl mx-auto flex gap-3">
                  <Textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Skriv ett meddelande..."
                    disabled={isLoading}
                    className="min-h-[52px] max-h-32 resize-none"
                    rows={1}
                  />
                  <Button
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || isLoading}
                    size="icon"
                    className="h-[52px] w-[52px] shrink-0"
                  >
                    {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
