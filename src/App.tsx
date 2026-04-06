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

// Protected route wrapper — redirects to /auth if not authenticated
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
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
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/properties" element={<ProtectedRoute><Properties /></ProtectedRoute>} />
          <Route path="/property/:id" element={<ProtectedRoute><PropertyDetail /></ProtectedRoute>} />
          <Route path="/components" element={<ProtectedRoute><Components /></ProtectedRoute>} />
          <Route path="/components/:id" element={<ProtectedRoute><ComponentDetail /></ProtectedRoute>} />
          <Route path="/work-orders" element={<ProtectedRoute><WorkOrders /></ProtectedRoute>} />
          <Route path="/operations" element={<ProtectedRoute><Operations /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
          <Route path="/projects/:id" element={<ProtectedRoute><ProjectDetail /></ProtectedRoute>} />
          <Route path="/cost-overview" element={<ProtectedRoute><CostOverview /></ProtectedRoute>} />
          <Route path="/recurring-costs" element={<ProtectedRoute><RecurringCosts /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/security" element={<ProtectedRoute><SecurityDashboard /></ProtectedRoute>} />
          <Route path="/ai-chat" element={<ProtectedRoute><AIChat /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
          <Route path="/user/settings" element={<ProtectedRoute><UserSettings /></ProtectedRoute>} />
          <Route path="/organization/settings" element={<ProtectedRoute><OrganizationSettings /></ProtectedRoute>} />
          <Route path="/founder/admin" element={<ProtectedRoute><FounderAdmin /></ProtectedRoute>} />
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
