import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User, Plus, Trash2, MessageSquare, Menu, Zap } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AIActionCard, type AIAction } from '@/components/ai-chat/AIActionCard';

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

export default function AIChat() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [streamingEnabled, setStreamingEnabled] = useState(true);
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
  const { data: conversationMessages = [], isLoading: messagesLoading, refetch: refetchMessages } = useQuery({
    queryKey: ['ai-messages', selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return [];
      
      console.log('Fetching messages for conversation:', selectedConversationId);
      const { data, error } = await supabase
        .from('ai_messages')
        .select('*')
        .eq('conversation_id', selectedConversationId)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error('Error fetching messages:', error);
        throw error;
      }
      console.log('Fetched messages:', data?.length);
      return data as Message[];
    },
    enabled: !!selectedConversationId,
    staleTime: 0,
  });

  // Fetch AI suggested actions for selected conversation
  const { data: conversationActions = [], refetch: refetchActions } = useQuery({
    queryKey: ['ai-actions', selectedConversationId],
    queryFn: async () => {
      if (!selectedConversationId) return [];
      
      const { data, error } = await (supabase as any)
        .from('ai_suggested_actions')
        .select('*')
        .eq('conversation_id', selectedConversationId)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error('Error fetching actions:', error);
        throw error;
      }
      return (data || []) as AIAction[];
    },
    enabled: !!selectedConversationId,
    staleTime: 0,
  });

  // Update local messages when conversation messages change
  useEffect(() => {
    setMessages(conversationMessages);
  }, [conversationMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Create new conversation mutation
  const createConversationMutation = useMutation({
    mutationFn: async (title: string) => {
      const { data, error } = await supabase
        .from('ai_conversations')
        .insert({ user_id: user!.id, title })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
      setSelectedConversationId(data.id);
      setMessages([]);
    }
  });

  // Delete conversation mutation
  const deleteConversationMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ai_conversations')
        .delete()
        .eq('id', id);
      
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

  // Update conversation title mutation
  const updateTitleMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase
        .from('ai_conversations')
        .update({ title })
        .eq('id', id);
      
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
    console.log('Selecting conversation:', id);
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

      // Process complete lines
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (line.startsWith(':') || line.trim() === '') continue;
        if (!line.startsWith('data: ')) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') {
          onDone();
          return;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {
          // Incomplete JSON, put back in buffer
          buffer = line + '\n' + buffer;
          break;
        }
      }
    }

    // Process any remaining buffer
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

  const sendMessage = async () => {
    if (!input.trim() || isLoading || !user) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      let conversationId = selectedConversationId;
      
      // Create new conversation if needed
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

      // Save user message to database
      await supabase
        .from('ai_messages')
        .insert({
          conversation_id: conversationId,
          role: 'user',
          content: userMessage.content
        });

      const messagesToSend = [...messages, userMessage].map(m => ({
        role: m.role,
        content: m.content
      }));

      let assistantContent = '';

      if (streamingEnabled) {
        // Streaming mode
        const assistantId = crypto.randomUUID();
        
        // Add empty assistant message that we'll update
        setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

        await streamChatResponse(
          messagesToSend,
          (delta) => {
            assistantContent += delta;
            setMessages(prev => 
              prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m)
            );
          },
          () => {
            // Done streaming
          }
        );
      } else {
        // Non-streaming mode - supports AI actions
        const invoke = async () => {
          const { data, error } = await supabase.functions.invoke('ai-chat', {
            body: { messages: messagesToSend, conversationId }
          });
          return { data, error };
        };

        let { data, error } = await invoke();

        const status = (error as any)?.context?.status ?? (error as any)?.status;
        if (error && status === 401) {
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshed?.session) {
            ({ data, error } = await invoke());
          }
        }

        if (error) throw error;

        assistantContent = data.message || 'Jag kunde inte generera ett svar just nu.';
        
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: assistantContent
        }]);

        // If there are suggested actions, refetch them
        if (data.suggestedActions && data.suggestedActions.length > 0) {
          console.log('AI suggested actions:', data.suggestedActions);
          refetchActions();
        }
      }

      // Save assistant message to database
      if (assistantContent) {
        await supabase
          .from('ai_messages')
          .insert({
            conversation_id: conversationId,
            role: 'assistant',
            content: assistantContent
          });
      }
      
      // Update title if this was the first message
      if (messages.length === 0) {
        const words = userMessage.content.split(' ').slice(0, 4).join(' ');
        const title = words + (userMessage.content.split(' ').length > 4 ? '...' : '');
        updateTitleMutation.mutate({
          id: conversationId,
          title
        });
      }
    } catch (error: any) {
      const status = error?.context?.status ?? error?.status;
      if (status === 401) {
        toast.error('Sessionen har gått ut. Logga in igen.');
        await supabase.auth.signOut();
        window.location.href = '/auth';
        return;
      }

      if (status === 503) {
        toast.error('AI-tjänsten är tillfälligt otillgänglig. Försök igen om en stund.');
      } else if (status === 429) {
        toast.error('För många förfrågningar. Vänta en stund och försök igen.');
      } else if (status === 402) {
        toast.error('Krediter slut. Lägg till mer i inställningarna.');
      } else {
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

  // Action handlers
  const handleApproveAction = async (actionId: string) => {
    try {
      // First update status to approved
      await (supabase as any)
        .from('ai_suggested_actions')
        .update({ 
          status: 'approved', 
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', actionId);

      // Then execute the action
      const { data, error } = await supabase.functions.invoke('execute-ai-action', {
        body: { actionId }
      });

      if (error) throw error;

      toast.success('Åtgärd utförd!');
      refetchActions();
      queryClient.invalidateQueries({ queryKey: ['pending-ai-actions'] });
    } catch (error) {
      console.error('Error executing action:', error);
      toast.error('Kunde inte utföra åtgärden');
    }
  };

  const handleRejectAction = async (actionId: string, reason?: string) => {
    try {
      await (supabase as any)
        .from('ai_suggested_actions')
        .update({ 
          status: 'rejected',
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason || null
        })
        .eq('id', actionId);

      toast.success('Förslag avvisat');
      refetchActions();
      queryClient.invalidateQueries({ queryKey: ['pending-ai-actions'] });
    } catch (error) {
      console.error('Error rejecting action:', error);
      toast.error('Kunde inte avvisa förslaget');
    }
  };

  const ConversationList = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <Button 
          onClick={handleNewConversation}
          className="w-full"
          variant="outline"
        >
          <Plus className="h-4 w-4 mr-2" />
          Ny konversation
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversationsLoading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Inga konversationer än
            </p>
          ) : (
            conversations.map((conv) => {
              const handleSelect = () => {
                setMessages([]);
                selectConversation(conv.id);
              };

              return (
                <div
                  key={conv.id}
                  role="button"
                  tabIndex={0}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors select-none",
                    selectedConversationId === conv.id
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  )}
                  onClick={handleSelect}
                  onPointerUp={handleSelect}
                  onKeyDown={(e) => e.key === 'Enter' && handleSelect()}
                >
                  <MessageSquare className="h-4 w-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{conv.title}</p>
                    <p
                      className={cn(
                        "text-xs",
                        selectedConversationId === conv.id
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground"
                      )}
                    >
                      {format(new Date(conv.updated_at), 'd MMM', { locale: sv })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-7 w-7 flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity",
                      selectedConversationId === conv.id
                        ? "text-primary-foreground hover:bg-primary-foreground/20"
                        : "hover:bg-destructive/10 hover:text-destructive"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (
                        window.confirm(
                          'Är du säker på att du vill ta bort denna konversation?'
                        )
                      ) {
                        deleteConversationMutation.mutate(conv.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />

        <main className="flex-1 flex flex-col">
          {/* Header */}
          <header className="h-14 border-b flex items-center justify-between px-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex items-center gap-2">
              <SidebarTrigger />

              {/* Mobile conversation list toggle */}
              {isMobile && (
                <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Menu className="h-5 w-5" />
                    </Button>
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
                </div>
              </div>
            </div>

            {/* Streaming toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="streaming"
                checked={streamingEnabled}
                onCheckedChange={setStreamingEnabled}
              />
              <Label htmlFor="streaming" className="text-xs text-muted-foreground flex items-center gap-1">
                <Zap className="h-3 w-3" />
                Streaming
              </Label>
            </div>
          </header>

          <div className="flex-1 flex overflow-hidden">
            {/* Desktop conversation sidebar */}
            {!isMobile && (
              <aside className="w-72 border-r flex-shrink-0 bg-muted/30">
                <ConversationList />
              </aside>
            )}

            {/* Chat area */}
            <div className="flex-1 flex flex-col">
              {/* Messages */}
              <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-20">
                    <Bot className="h-16 w-16 mb-4 opacity-30" />
                    <h2 className="text-xl font-medium mb-2">Hur kan jag hjälpa?</h2>
                    <p className="text-sm max-w-md">
                      Ställ frågor om dina fastigheter, komponenter, projekt, arbetsordrar eller andra delar av systemet.
                    </p>
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto space-y-6">
                    {messages.map((message, index) => (
                      <div key={message.id}>
                        <div
                          className={cn(
                            "flex gap-4",
                            message.role === 'user' && "flex-row-reverse"
                          )}
                        >
                          <div className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                            message.role === 'user' 
                              ? "bg-primary text-primary-foreground" 
                              : "bg-muted"
                          )}>
                            {message.role === 'user' ? (
                              <User className="h-5 w-5" />
                            ) : (
                              <Bot className="h-5 w-5" />
                            )}
                          </div>
                          <div className={cn(
                            "rounded-2xl px-4 py-3 max-w-[80%] whitespace-pre-wrap",
                            message.role === 'user'
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                          )}>
                            {message.content || (isLoading && message.role === 'assistant' ? (
                              <span className="text-muted-foreground">...</span>
                            ) : null)}
                          </div>
                        </div>
                        {/* Show AI action cards after assistant messages */}
                        {message.role === 'assistant' && conversationActions.length > 0 && (
                          <div className="ml-14 mt-3 space-y-2">
                            {conversationActions
                              .filter((_, i) => i === conversationActions.length - 1 || index === messages.length - 1)
                              .slice(-3)
                              .map((action) => (
                                <AIActionCard
                                  key={action.id}
                                  action={action}
                                  onApprove={handleApproveAction}
                                  onReject={handleRejectAction}
                                />
                              ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
                      <div className="flex gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                          <Bot className="h-5 w-5" />
                        </div>
                        <div className="rounded-2xl px-4 py-3 bg-muted">
                          <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="text-sm text-muted-foreground">Tänker...</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>

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
                    onClick={sendMessage}
                    disabled={!input.trim() || isLoading}
                    size="icon"
                    className="h-[52px] w-[52px] shrink-0"
                  >
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
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
