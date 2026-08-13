import React, { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { NotificationsProvider } from "@/hooks/useNotifications";
import { ThemeProvider } from "@/hooks/useTheme";
import { useGlobalShortcuts } from "@/hooks/useKeyboardShortcuts";
import { GlobalSearchDialog } from "@/components/GlobalSearchDialog";
import { Loader2 } from "lucide-react";
import { BottomNavigation } from "@/components/BottomNavigation";
import { useIsMobile } from "@/hooks/use-mobile";
import AIChatBubble from "@/components/ai-chat/AIChatBubble";
import { InstallPWAPrompt } from "@/components/InstallPWAPrompt";
import ErrorBoundary from "@/components/ErrorBoundary";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
import { RequireFounder } from "@/components/RequireRole";
import { WorkspaceBootstrap } from "@/components/WorkspaceBootstrap";
import { OrgTheme } from "@/components/organization/OrgTheme";

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
const WorkOrders = lazy(() => import("./pages/WorkOrders"));
const Projects = lazy(() => import("./pages/Projects"));
const OrganizationSettings = lazy(() => import("./pages/OrganizationSettings"));
const UserSettings = lazy(() => import("./pages/UserSettings"));
const FounderAdmin = lazy(() => import("./pages/FounderAdmin"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Jarvis = lazy(() => import("./pages/Jarvis"));
const AcceptInvitation = lazy(() => import("./pages/AcceptInvitation"));

// Loading component
const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

// Protected route wrapper — redirects to /auth if not authenticated,
// then ensures org/workspace exists (first-run onboarding).
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  return (
    <WorkspaceBootstrap>
      <RouteErrorBoundary>{children}</RouteErrorBoundary>
    </WorkspaceBootstrap>
  );
};

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
          <Route path="/auth" element={<Auth />} />
          <Route path="/invite/:token" element={<ProtectedRoute><AcceptInvitation /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/properties" element={<ProtectedRoute><Properties /></ProtectedRoute>} />
          <Route path="/property/:id" element={<ProtectedRoute><PropertyDetail /></ProtectedRoute>} />
          <Route path="/components" element={<ProtectedRoute><Components /></ProtectedRoute>} />
          <Route path="/components/:id" element={<ProtectedRoute><ComponentDetail /></ProtectedRoute>} />
          <Route path="/work-orders" element={<ProtectedRoute><WorkOrders /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
          <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
          <Route path="/jarvis" element={<ProtectedRoute><Jarvis /></ProtectedRoute>} />
          <Route path="/ai-chat" element={<Navigate to="/jarvis?tab=chat" replace />} />
          <Route path="/agent" element={<Navigate to="/jarvis?tab=actions" replace />} />
          <Route path="/users" element={<ProtectedRoute><RequireFounder><Users /></RequireFounder></ProtectedRoute>} />
          <Route path="/user/settings" element={<ProtectedRoute><UserSettings /></ProtectedRoute>} />
          <Route path="/organization/settings" element={<ProtectedRoute><RequireFounder><OrganizationSettings /></RequireFounder></ProtectedRoute>} />
          <Route path="/founder/admin" element={<ProtectedRoute><RequireFounder><FounderAdmin /></RequireFounder></ProtectedRoute>} />
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
  <ThemeProvider>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <NotificationsProvider>
                <OrgTheme />
                <AppContent />
              </NotificationsProvider>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </ThemeProvider>
);

export default App;
