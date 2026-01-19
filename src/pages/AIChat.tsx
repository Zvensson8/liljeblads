import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User, Plus, Trash2, MessageSquare, Menu } from 'lucide-react';
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
  const scrollRef = useRef<HTMLDivElement>(null);
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
    staleTime: 0, // Always refetch when conversation changes
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
    // Force refetch messages for this conversation
    await queryClient.invalidateQueries({ queryKey: ['ai-messages', id] });
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

      // Call AI
      const { data, error } = await supabase.functions.invoke('ai-chat', {
        body: {
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          }))
        }
      });

      if (error) throw error;

      const assistantContent = data.message || 'Jag kunde inte generera ett svar just nu.';
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: assistantContent
      };

      // Save assistant message to database
      await supabase
        .from('ai_messages')
        .insert({
          conversation_id: conversationId,
          role: 'assistant',
          content: assistantContent
        });

      setMessages(prev => [...prev, assistantMessage]);
      
      // Update title if this was the first message
      if (messages.length === 0) {
        const words = userMessage.content.split(' ').slice(0, 4).join(' ');
        const title = words + (userMessage.content.split(' ').length > 4 ? '...' : '');
        updateTitleMutation.mutate({
          id: conversationId,
          title
        });
      }
    } catch (error) {
      console.error('AI chat error:', error);
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
                // Clear immediately so det känns responsivt, och ladda sedan rätt historik
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
                    {messages.map((message) => (
                      <div
                        key={message.id}
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
                          {message.content}
                        </div>
                      </div>
                    ))}
                    {isLoading && (
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
                    className="min-h-[44px] max-h-32 resize-none"
                    rows={1}
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!input.trim() || isLoading}
                    size="icon"
                    className="h-11 w-11 shrink-0"
                  >
                    <Send className="h-5 w-5" />
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
