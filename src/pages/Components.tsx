import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { Building2, MapPin, Package, ExternalLink } from 'lucide-react';
import { ComponentFormDialog } from '@/components/ComponentFormDialog';

interface Component {
  id: string;
  name: string;
  type: string;
  status: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  room_zone: string | null;
  installation_year: number | null;
  floor_id: string;
  floor_name?: string;
  floor_level?: number | null;
  property_id?: string;
  property_name?: string;
  property_address?: string | null;
}

const Components = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    } else if (user) {
      fetchComponents();
    }
  }, [user, authLoading, navigate]);

  const fetchComponents = async () => {
    const { data, error } = await supabase
      .from('components')
      .select(`
        *,
        floors:floor_id (
          id,
          name,
          level,
          property_id,
          properties:property_id (
            id,
            name,
            address
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Fel',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      const formattedData = data.map((comp: any) => ({
        ...comp,
        floor_name: comp.floors?.name,
        floor_level: comp.floors?.level,
        property_id: comp.floors?.properties?.id,
        property_name: comp.floors?.properties?.name,
        property_address: comp.floors?.properties?.address,
      }));
      setComponents(formattedData);
    }

    setLoading(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 text-green-500 hover:bg-green-500/20';
      case 'maintenance':
        return 'bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20';
      case 'inactive':
        return 'bg-red-500/10 text-red-500 hover:bg-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 hover:bg-gray-500/20';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Aktiv';
      case 'maintenance':
        return 'Underhåll';
      case 'inactive':
        return 'Inaktiv';
      default:
        return status;
    }
  };

  const handleEditComponent = (component: Component) => {
    setSelectedComponent(component);
    setDialogOpen(true);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1">
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Komponenter</h1>
            </div>
          </header>

          <main className="flex-1 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-muted-foreground">
                    Hantera alla komponenter från dina fastigheter
                  </p>
                </div>
                <Badge variant="outline" className="text-base px-4 py-2">
                  {components.length} komponenter
                </Badge>
              </div>

              {components.length === 0 ? (
                <Card className="text-center py-16 border-dashed">
                  <CardContent>
                    <div className="inline-flex p-4 rounded-full bg-primary/10 text-primary mb-4">
                      <Package className="h-8 w-8" />
                    </div>
                    <CardTitle className="mb-2 text-xl">Inga komponenter ännu</CardTitle>
                    <CardDescription className="text-base mb-4">
                      Lägg till komponenter via ritningarna i dina fastigheter
                    </CardDescription>
                    <Button onClick={() => navigate('/properties')}>
                      Gå till Fastigheter
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {components.map((component) => (
                    <Card
                      key={component.id}
                      className="group hover:shadow-lg transition-all duration-300 cursor-pointer"
                      onClick={() => handleEditComponent(component)}
                    >
                      <CardHeader>
                        <div className="flex justify-between items-start mb-2">
                          <CardTitle className="text-lg">{component.name}</CardTitle>
                          <Badge className={getStatusColor(component.status)}>
                            {getStatusText(component.status)}
                          </Badge>
                        </div>
                        <CardDescription className="text-sm font-medium text-foreground/70">
                          {component.type}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {component.manufacturer && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Tillverkare: </span>
                            <span className="font-medium">{component.manufacturer}</span>
                          </div>
                        )}
                        {component.model && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Modell: </span>
                            <span className="font-medium">{component.model}</span>
                          </div>
                        )}
                        {component.room_zone && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Rum/Zon: </span>
                            <span className="font-medium">{component.room_zone}</span>
                          </div>
                        )}
                        {component.installation_year && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Installerad: </span>
                            <span className="font-medium">{component.installation_year}</span>
                          </div>
                        )}
                        
                        <div className="pt-3 border-t border-border space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Building2 className="h-4 w-4 text-primary" />
                            <span className="font-medium">{component.property_name}</span>
                          </div>
                          {component.property_address && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <MapPin className="h-4 w-4" />
                              <span className="text-xs">{component.property_address}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span className="text-xs">
                              {component.floor_name}
                              {component.floor_level !== null && ` (Våning ${component.floor_level})`}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/property/${component.property_id}`);
                            }}
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Gå till ritning
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </main>
        </SidebarInset>
      </div>

      <ComponentFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        floorId={selectedComponent?.floor_id || ''}
        editingComponent={selectedComponent}
        onSuccess={() => {
          setDialogOpen(false);
          setSelectedComponent(null);
          fetchComponents();
        }}
      />
    </SidebarProvider>
  );
};

export default Components;
