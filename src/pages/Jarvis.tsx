import { useSearchParams } from 'react-router-dom';
import { Bot, MessageSquare, Sparkles, History } from 'lucide-react';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AIChat from '@/pages/AIChat';
import AgentActivity from '@/pages/AgentActivity';
import JarvisRecentActions from '@/components/ai-chat/JarvisRecentActions';

/**
 * Single Jarvis entry: chat + HITL proposals + action log.
 * Deep-link: /jarvis?tab=chat | actions | log
 */
export default function Jarvis() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');
  const tab =
    raw === 'actions' || raw === 'log' ? raw : 'chat';

  const setTab = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', value);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 w-full flex flex-col min-h-0">
          <header className="sticky top-0 z-10 flex h-14 md:h-16 items-center gap-2 md:gap-4 border-b border-border bg-background/95 backdrop-blur px-4 md:px-6 shrink-0">
            <SidebarTrigger className="hidden md:flex" />
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <h1 className="text-lg md:text-xl font-semibold">Jarvis</h1>
            </div>
            <p className="hidden sm:block text-sm text-muted-foreground ml-2">
              Fråga, agera, spåra — och godkänn förslag
            </p>
          </header>

          <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
            <div className="border-b px-4 md:px-6 shrink-0">
              <TabsList className="h-11 bg-transparent p-0 gap-4">
                <TabsTrigger
                  value="chat"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Chat
                </TabsTrigger>
                <TabsTrigger
                  value="actions"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Förslag
                </TabsTrigger>
                <TabsTrigger
                  value="log"
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-1"
                >
                  <History className="h-4 w-4 mr-2" />
                  Logg
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="chat" className="flex-1 m-0 min-h-0 data-[state=inactive]:hidden">
              <AIChat embedded />
            </TabsContent>
            <TabsContent value="actions" className="flex-1 m-0 min-h-0 data-[state=inactive]:hidden">
              <AgentActivity embedded />
            </TabsContent>
            <TabsContent
              value="log"
              className="flex-1 m-0 min-h-0 overflow-y-auto p-4 md:p-6 data-[state=inactive]:hidden"
            >
              <div className="max-w-3xl mx-auto">
                <JarvisRecentActions />
              </div>
            </TabsContent>
          </Tabs>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
