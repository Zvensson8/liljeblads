import { Building2, Compass, Home, LogOut, Settings, Users, ClipboardList, DollarSign, Wrench, Briefcase, Building, Crown, UserCog, User, FileText, Shield, Bot, type LucideIcon } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { useModuleAccess, ModuleName } from "@/hooks/useModuleAccess";
import { useIsFounder } from "@/hooks/useUserRoles";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "./ui/button";
import { NotificationBell } from "./NotificationBell";
import { KeyboardShortcutsDialog } from "./KeyboardShortcutsDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";

const navigationItems: Array<{ title: string; url: string; icon: any; moduleName: ModuleName; founderOnly?: boolean }> = [
  { title: "Dashboard", url: "/dashboard", icon: Home, moduleName: "dashboard" },
  { title: "Fastigheter", url: "/properties", icon: Building2, moduleName: "properties" },
  { title: "Komponenter", url: "/components", icon: Settings, moduleName: "components" },
  { title: "Arbetsordrar", url: "/work-orders", icon: Wrench, moduleName: "work-orders" },
  { title: "Driftuppföljning", url: "/operations", icon: ClipboardList, moduleName: "operations" },
  { title: "Projekthantering", url: "/projects", icon: Briefcase, moduleName: "projects" },
  { title: "Återkommande kostnader", url: "/recurring-costs", icon: DollarSign, moduleName: "recurring-costs" },
  { title: "AI Assistent", url: "/ai-chat", icon: Bot, moduleName: "ai-chat" },
  { title: "Rapporter", url: "/reports", icon: FileText, moduleName: "dashboard", founderOnly: true },
  { title: "Säkerhet", url: "/security", icon: Shield, moduleName: "organization", founderOnly: true },
  { title: "Användare", url: "/users", icon: Users, moduleName: "users" },
  { title: "Organisation", url: "/organization/settings", icon: Building, moduleName: "organization" },
];

export function AppSidebar() {
  const isMobile = useIsMobile();
  const { state } = useSidebar();
  const { signOut } = useAuth();
  const { organization } = useOrganization();
  const { hasModuleAccess, moduleAccess } = useModuleAccess();
  const { isFounder } = useIsFounder();
  const navigate = useNavigate();
  const isCollapsed = state === "collapsed";

  // Filter navigation items based on module access and founder status
  const visibleNavigationItems = navigationItems.filter(item => {
    // Check if item requires founder access
    if (item.founderOnly && !isFounder) {
      return false;
    }
    // Check module access
    return hasModuleAccess(item.moduleName);
  });

  // Hide sidebar on mobile - use bottom navigation instead
  if (isMobile) {
    return null;
  }

  // Använd organisationens namn eller fallback till NavRitning
  const appName = organization?.name || "NavRitning";
  const appDescription = organization?.name ? "Fastighetshantering" : "Ritningshantering";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Logo and brand */}
        <div className={`flex items-center justify-between p-4 border-b border-border ${isCollapsed ? 'flex-col gap-2' : ''}`}>
          <div className={`flex items-center gap-3 ${isCollapsed ? 'flex-col' : ''}`}>
            {organization?.logo_url ? (
              // Visa organisationens logga
              <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center bg-muted">
                <img 
                  src={organization.logo_url} 
                  alt={`${organization.name} logo`}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              // Fallback till standard ikon
              <div className="bg-gradient-to-br from-primary to-primary/70 p-2 rounded-lg">
                <Compass className="h-6 w-6 text-primary-foreground" />
              </div>
            )}
            {!isCollapsed && (
              <div>
                <h2 className="font-bold text-lg">{appName}</h2>
                <p className="text-xs text-muted-foreground">{appDescription}</p>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <div className="flex items-center gap-1">
              <NotificationBell />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="hover:bg-accent">
                    <UserCog className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-50">
                  <DropdownMenuItem onClick={() => navigate('/user/settings')}>
                    <UserCog className="h-4 w-4 mr-2" />
                    Mina inställningar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <KeyboardShortcutsDialog />
            </div>
          )}
        </div>

        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className={`text-muted-foreground text-xs uppercase tracking-wider ${isCollapsed ? 'sr-only' : ''}`}>
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleNavigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="hover:bg-sidebar-accent">
                    <NavLink
                      to={item.url}
                      end
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-2 transition-all text-sidebar-foreground ${
                          isActive
                            ? 'bg-primary text-primary-foreground font-medium shadow-lg'
                            : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        }`
                      }
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Founder Admin Section */}
        {isFounder && (
          <SidebarGroup>
            <SidebarGroupLabel className={`text-muted-foreground text-xs uppercase tracking-wider ${isCollapsed ? 'sr-only' : ''}`}>
              Founder
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className="hover:bg-sidebar-accent">
                    <NavLink
                      to="/founder/admin"
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-2 transition-all text-sidebar-foreground ${
                          isActive
                            ? 'bg-gradient-to-r from-yellow-500 to-yellow-600 text-white font-medium shadow-lg'
                            : 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                        }`
                      }
                    >
                      <Crown className="h-5 w-5 flex-shrink-0" />
                      {!isCollapsed && <span>Admin Panel</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer with sign out */}
      <SidebarFooter className="border-t border-border p-4 space-y-1">
        <ThemeToggle collapsed={isCollapsed} />
        <Button
          variant="ghost"
          onClick={signOut}
          className={`w-full ${isCollapsed ? 'px-2' : 'justify-start'}`}
        >
          <LogOut className="h-5 w-5" />
          {!isCollapsed && <span className="ml-3">Logga ut</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
