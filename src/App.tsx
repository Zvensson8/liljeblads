import React, { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { NotificationsProvider } from "@/hooks/useNotifications";
import { useGlobalShortcuts } from "@/hooks/useKeyboardShortcuts";
import { GlobalSearchDialog } from "@/components/GlobalSearchDialog";
import { Loader2 } from "lucide-react";
import { BottomNavigation } from "@/components/BottomNavigation";
import { useIsMobile } from "@/hooks/use-mobile";
import AIChatBubble from "@/components/ai-chat/AIChatBubble";
import { InstallPWAPrompt } from "@/components/InstallPWAPrompt";
import ErrorBoundary from "@/components/ErrorBoundary";

// Lazy load all routes for better performance
const Index = lazy(() => import("./pages/Index"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Auth = lazy(() => import("./pages/Auth"));
const Properties = lazy(() => import("./pages/Properties"));
const PropertyDetail = lazy(() => import("./pages/PropertyDetail"));
const Components = lazy(() => import("./pages/Components"));
const ComponentDetail = lazy(() => import("./pages/ComponentDetail"));
const ProjectDetail = lazy(() => import("./pages/ProjectDetail"));
const Users = lazy(() => import("./pages/Users"));
const Operations = lazy(() => import("./pages/Operations"));
const CostOverview = lazy(() => import("./pages/CostOverview"));
const WorkOrders = lazy(() => import("./pages/WorkOrders"));
const Projects = lazy(() => import("./pages/Projects"));
const OrganizationSettings = lazy(() => import("./pages/OrganizationSettings"));
const UserSettings = lazy(() => import("./pages/UserSettings"));
const FounderAdmin = lazy(() => import("./pages/FounderAdmin"));
const NotFound = lazy(() => import("./pages/NotFound"));
const RecurringCosts = lazy(() => import("./pages/RecurringCosts"));
const Reports = lazy(() => import("./pages/Reports"));
const SecurityDashboard = lazy(() => import("./pages/SecurityDashboard"));
const AIChat = lazy(() => import("./pages/AIChat"));

// Loading component
const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const AppContent = () => {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const isMobile = useIsMobile();
  useGlobalShortcuts(() => setSearchOpen(true));
  
  return (
    <>
      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/properties" element={<Properties />} />
          <Route path="/property/:id" element={<PropertyDetail />} />
          <Route path="/components" element={<Components />} />
          <Route path="/components/:id" element={<ComponentDetail />} />
          <Route path="/work-orders" element={<WorkOrders />} />
          <Route path="/operations" element={<Operations />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/cost-overview" element={<CostOverview />} />
          <Route path="/recurring-costs" element={<RecurringCosts />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/security" element={<SecurityDashboard />} />
          <Route path="/ai-chat" element={<AIChat />} />
          <Route path="/users" element={<Users />} />
          <Route path="/user/settings" element={<UserSettings />} />
          <Route path="/organization/settings" element={<OrganizationSettings />} />
          <Route path="/founder/admin" element={<FounderAdmin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
      {isMobile && <BottomNavigation />}
      <AIChatBubble />
      <InstallPWAPrompt />
    </>
  );
};

// Import the configured query client
import { queryClient } from './lib/queryClient';

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <NotificationsProvider>
              <AppContent />
            </NotificationsProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
