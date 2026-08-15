import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Building2, Wrench, FolderKanban, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useState } from 'react';
import { useModuleAccess, ModuleName } from '@/hooks/useModuleAccess';
import { useIsFounder } from '@/hooks/useUserRoles';

export const BottomNavigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { hasModuleAccess } = useModuleAccess();
  const { isFounder } = useIsFounder();

  const isActive = (path: string) => location.pathname === path;

  const allPrimaryNavItems = [
    { path: '/dashboard', icon: Home, label: 'Hem', moduleName: 'dashboard' as ModuleName },
    { path: '/properties', icon: Building2, label: 'Fastigheter', moduleName: 'properties' as ModuleName },
    { path: '/components', icon: Wrench, label: 'Komponenter', moduleName: 'components' as ModuleName },
    { path: '/work-orders', icon: FolderKanban, label: 'Ordrar', moduleName: 'work-orders' as ModuleName },
  ];

  const allSecondaryNavItems = [
    { path: '/maintenance', label: 'Underhåll', moduleName: 'maintenance' as ModuleName },
    { path: '/projects', label: 'Projekt', moduleName: 'projects' as ModuleName },
    { path: '/jarvis', label: 'Jarvis', moduleName: 'ai-chat' as ModuleName },
    { path: '/user/settings', label: 'Mina inställningar', moduleName: 'dashboard' as ModuleName },
  ];

  const founderSecondary = [
    { path: '/organization/settings', label: 'Organisation' },
    { path: '/users', label: 'Användare' },
    { path: '/founder/admin', label: 'Admin Panel' },
  ];

  const primaryNavItems = allPrimaryNavItems.filter((item) =>
    hasModuleAccess(item.moduleName),
  );
  const secondaryNavItems = allSecondaryNavItems.filter((item) =>
    hasModuleAccess(item.moduleName),
  );

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:hidden">
        <div className="grid grid-cols-5 h-16">
          {primaryNavItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-col items-center justify-center gap-1 transition-colors ${
                isActive(item.path)
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          ))}

          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button className="flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                <MoreHorizontal className="h-5 w-5" />
                <span className="text-xs font-medium">Mer</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[60vh]">
              <SheetHeader>
                <SheetTitle>Meny</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-2">
                {secondaryNavItems.map((item) => (
                  <Button
                    key={item.path}
                    variant={isActive(item.path) ? 'secondary' : 'ghost'}
                    className="w-full justify-start h-12"
                    onClick={() => {
                      navigate(item.path);
                      setSheetOpen(false);
                    }}
                  >
                    {item.label}
                  </Button>
                ))}
                {isFounder &&
                  founderSecondary.map((item) => (
                    <Button
                      key={item.path}
                      variant={isActive(item.path) ? 'secondary' : 'ghost'}
                      className="w-full justify-start h-12"
                      onClick={() => {
                        navigate(item.path);
                        setSheetOpen(false);
                      }}
                    >
                      {item.label}
                    </Button>
                  ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
      <div className="h-16 md:hidden" />
    </>
  );
};
