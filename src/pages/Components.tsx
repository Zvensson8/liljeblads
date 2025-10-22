import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { Building2, MapPin, Package, ExternalLink, Plus, Trash2, Download, Upload } from 'lucide-react';
import { ComponentFormDialog } from '@/components/ComponentFormDialog';
import { MaintenanceHistoryDialog } from '@/components/MaintenanceHistoryDialog';
import { SelectPropertyFloorDialog } from '@/components/SelectPropertyFloorDialog';
import { ComponentImportDialog } from '@/components/ComponentImportDialog';
import { exportComponentsToExcel, exportComponentsToPDF } from '@/lib/exportUtils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

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
  registration_number: string | null;
  refrigerant_code: string | null;
  refrigerant_amount_kg: number | null;
  refrigerant_type: string | null;
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
  const [selectPropertyDialogOpen, setSelectPropertyDialogOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [selectedFloorId, setSelectedFloorId] = useState('');

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

  const handleExport = async (format: 'excel' | 'pdf') => {
    // Fetch maintenance records for all components
    const maintenanceRecords: Record<string, any[]> = {};
    
    for (const component of components) {
      const { data } = await supabase
        .from('maintenance_history')
        .select('*')
        .eq('component_id', component.id)
        .order('performed_date', { ascending: false });
      
      maintenanceRecords[component.id] = data || [];
    }

    if (format === 'excel') {
      exportComponentsToExcel(
        components,
        maintenanceRecords,
        `komponenter-${new Date().toISOString().split('T')[0]}.xlsx`
      );
      toast({
        title: 'Export lyckades',
        description: 'Komponenter exporterade till Excel',
      });
    } else {
      exportComponentsToPDF(
        components,
        maintenanceRecords,
        'Komponentregister',
        `komponenter-${new Date().toISOString().split('T')[0]}.pdf`
      );
      toast({
        title: 'Export lyckades',
        description: 'Komponenter exporterade till PDF',
      });
    }
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

  const handleNewComponent = () => {
    setSelectPropertyDialogOpen(true);
  };

  const handlePropertyFloorSelected = (propertyId: string, floorId: string) => {
    setSelectedPropertyId(propertyId);
    setSelectedFloorId(floorId);
    setSelectPropertyDialogOpen(false);
    setDialogOpen(true);
  };

  const handleDeleteComponent = async (componentId: string, componentName: string) => {
    if (!confirm(`Är du säker på att du vill ta bort ${componentName}?`)) {
      return;
    }

    const { error } = await supabase
      .from('components')
      .delete()
      .eq('id', componentId);

    if (error) {
      toast({
        title: 'Fel',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Komponent borttagen',
        description: `${componentName} har tagits bort.`,
      });
      fetchComponents();
    }
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
              <Tabs defaultValue="components" className="w-full">
                <TabsList>
                  <TabsTrigger value="components">Komponenter</TabsTrigger>
                  <TabsTrigger value="costs">Kostnadsöversikt</TabsTrigger>
                </TabsList>

                <TabsContent value="components" className="space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                      <p className="text-muted-foreground">
                        Hantera alla komponenter från dina fastigheter
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-4 w-full sm:w-auto">
                  <Badge variant="outline" className="text-base px-4 py-2">
                    {components.length} komponenter
                  </Badge>
                  <ComponentImportDialog onSuccess={fetchComponents} />
                  {components.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 mr-2" />
                          Exportera
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => handleExport('excel')}>
                          Exportera till Excel
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleExport('pdf')}>
                          Exportera till PDF
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                      <Button onClick={handleNewComponent} className="flex-1 sm:flex-none">
                        <Plus className="h-4 w-4 mr-2" />
                        Ny komponent
                      </Button>
                    </div>
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
                          onClick={() => navigate(`/components/${component.id}`)}
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
                          <div className="flex flex-col gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="flex gap-2">
                              <div onClick={(e) => e.stopPropagation()} className="flex-1">
                                <MaintenanceHistoryDialog
                                  componentId={component.id}
                                  componentName={component.name}
                                />
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="flex-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/property/${component.property_id}`);
                                }}
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Ritning
                              </Button>
                            </div>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteComponent(component.id, component.name);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Ta bort
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="costs">
                <Card>
                  <CardHeader>
                    <CardTitle>Kostnadsöversikt</CardTitle>
                    <CardDescription>
                      Analysera och följ upp underhållskostnader för alla komponenter
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-12">
                      <p className="text-muted-foreground mb-4">
                        Kostnadsöversikt över alla komponenter kommer snart
                      </p>
                      <Button variant="outline" onClick={() => navigate('/cost-overview')}>
                        Öppna fullständig kostnadsöversikt
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
            </div>
          </main>
        </SidebarInset>
      </div>

      <SelectPropertyFloorDialog
        open={selectPropertyDialogOpen}
        onOpenChange={setSelectPropertyDialogOpen}
        onSelect={handlePropertyFloorSelected}
      />

      <ComponentFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setSelectedComponent(null);
            setSelectedFloorId('');
            setSelectedPropertyId('');
          }
        }}
        floorId={selectedComponent?.floor_id || selectedFloorId}
        propertyId={selectedComponent?.property_id || selectedPropertyId}
        editingComponent={selectedComponent}
        onSuccess={() => {
          setDialogOpen(false);
          setSelectedComponent(null);
          setSelectedFloorId('');
          setSelectedPropertyId('');
          fetchComponents();
        }}
      />
    </SidebarProvider>
  );
};

export default Components;
