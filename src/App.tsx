import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { NotificationsProvider } from "@/hooks/useNotifications";
import { useGlobalShortcuts } from "@/hooks/useKeyboardShortcuts";
import { GlobalSearchDialog } from "@/components/GlobalSearchDialog";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import Properties from "./pages/Properties";
import PropertyDetail from "./pages/PropertyDetail";
import Components from "./pages/Components";
import ComponentDetail from "./pages/ComponentDetail";
import ProjectDetail from "./pages/ProjectDetail";
import Users from "./pages/Users";
import Operations from "./pages/Operations";
import CostOverview from "./pages/CostOverview";
import WorkOrders from "./pages/WorkOrders";
import Projects from "./pages/Projects";
import OrganizationSettings from "./pages/OrganizationSettings";
import FounderAdmin from "./pages/FounderAdmin";
import NotFound from "./pages/NotFound";
import RecurringCosts from "./pages/RecurringCosts";
import { AppSidebar } from "./components/AppSidebar";
import { SidebarProvider, SidebarInset } from "./components/ui/sidebar";

const AppContent = () => {
  const [searchOpen, setSearchOpen] = React.useState(false);
  useGlobalShortcuts(() => setSearchOpen(true));
  return (
    <SidebarProvider>
      <AppSidebar onOpenSearch={() => setSearchOpen(true)} />
      <SidebarInset>
        <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
        <Routes>
          <Route path="/" element={<Dashboard />} />
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
          <Route path="/users" element={<Users />} />
          <Route path="/organization/settings" element={<OrganizationSettings />} />
          <Route path="/founder/admin" element={<FounderAdmin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </SidebarInset>
    </SidebarProvider>
  );
};

const queryClient = new QueryClient();

const App = () => (
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
);

export default App;
