import { Building2, Compass, Home, LogOut, Settings } from "lucide-react";
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

const navigationItems = [
  { title: "Hem", url: "/", icon: Home },
  { title: "Fastigheter", url: "/properties", icon: Building2 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { signOut } = useAuth();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Logo and brand */}
        <div className={`flex items-center gap-3 p-4 border-b border-border ${isCollapsed ? 'justify-center' : ''}`}>
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

        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel className={isCollapsed ? 'sr-only' : ''}>
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                          isActive
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'hover:bg-muted'
                        }`
                      }
                    >
                      <item.icon className="h-5 w-5" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer with sign out */}
      <SidebarFooter className="border-t border-border p-4">
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
