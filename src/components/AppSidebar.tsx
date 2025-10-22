import { Building2, Compass, Home, LogOut, Settings, Users, ClipboardList, DollarSign, Wrench, Briefcase } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
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

const navigationItems = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "Fastigheter", url: "/properties", icon: Building2 },
  { title: "Komponenter", url: "/components", icon: Settings },
  { title: "Arbetsordrar", url: "/work-orders", icon: Wrench },
  { title: "Driftuppföljning", url: "/operations", icon: ClipboardList },
  { title: "Projekthantering", url: "/projects", icon: Briefcase },
  { title: "Användare", url: "/users", icon: Users },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { signOut } = useAuth();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Logo and brand */}
        <div className={`flex items-center justify-between p-4 border-b border-border ${isCollapsed ? 'flex-col gap-2' : ''}`}>
          <div className={`flex items-center gap-3 ${isCollapsed ? 'flex-col' : ''}`}>
            <div className="bg-gradient-to-br from-primary to-primary/70 p-2 rounded-lg">
              <Compass className="h-6 w-6 text-primary-foreground" />
            </div>
            {!isCollapsed && (
              <div>
                <h2 className="font-bold text-lg">NavRitning</h2>
                <p className="text-xs text-muted-foreground">Ritningshantering</p>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <div className="flex items-center gap-1">
              <NotificationBell />
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
              {navigationItems.map((item) => (
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
      </SidebarContent>

      {/* Footer with external link and sign out */}
      <SidebarFooter className="border-t border-border p-4 space-y-2">
        <Button
          variant="ghost"
          asChild
          className={`w-full ${isCollapsed ? 'px-2' : 'justify-start'}`}
        >
          <a href="https://liljeblads.abacusai.app/dashboard" target="_blank" rel="noopener noreferrer">
            <Home className="h-5 w-5" />
            {!isCollapsed && <span className="ml-3">Hem</span>}
          </a>
        </Button>
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
