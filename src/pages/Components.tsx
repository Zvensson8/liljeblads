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
import { Building2, MapPin, Package, ExternalLink, Plus, Trash2, Download, Upload, LayoutGrid, Table as TableIcon, Edit, Filter, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ComponentFormDialog } from '@/components/ComponentFormDialog';
import { MaintenanceHistoryDialog } from '@/components/MaintenanceHistoryDialog';
import { SelectPropertyFloorDialog } from '@/components/SelectPropertyFloorDialog';
import { ComponentImportDialog } from '@/components/ComponentImportDialog';
import { exportComponentsToExcel, exportComponentsToPDF } from '@/lib/exportUtils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FloorSelector } from '@/components/FloorSelector';
import { QuickServiceButton } from '@/components/QuickServiceButton';
import { LastServiceBadge } from '@/components/LastServiceBadge';

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
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterProperty, setFilterProperty] = useState<string>('all');
  const [filterManufacturer, setFilterManufacturer] = useState<string>('all');
  const [filterModel, setFilterModel] = useState<string>('all');

  // Get unique values for filter dropdowns
  const uniqueTypes = [...new Set(components.map(c => c.type))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'sv'));
  const uniqueProperties = [...new Set(components.map(c => c.property_name))].filter(Boolean).sort((a, b) => (a || '').localeCompare(b || '', 'sv'));
  const uniqueManufacturers = [...new Set(components.map(c => c.manufacturer))].filter(Boolean).sort((a, b) => (a || '').localeCompare(b || '', 'sv'));
  const uniqueModels = [...new Set(components.map(c => c.model))].filter(Boolean).sort((a, b) => (a || '').localeCompare(b || '', 'sv'));

  // Filter components
  const filteredComponents = components.filter(component => {
    if (filterType !== 'all' && component.type !== filterType) return false;
    if (filterProperty !== 'all' && component.property_name !== filterProperty) return false;
    if (filterManufacturer !== 'all' && component.manufacturer !== filterManufacturer) return false;
    if (filterModel !== 'all' && component.model !== filterModel) return false;
    return true;
  });

  const hasActiveFilters = filterType !== 'all' || filterProperty !== 'all' || filterManufacturer !== 'all' || filterModel !== 'all';

  const clearFilters = () => {
    setFilterType('all');
    setFilterProperty('all');
    setFilterManufacturer('all');
    setFilterModel('all');
  };

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
          properties:property_id (
            id,
            name,
            address
          )
        ),
        direct_property:property_id (
          id,
          name,
          address
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
        property_name: comp.floors?.properties?.name || comp.direct_property?.name,
        property_address: comp.floors?.properties?.address || comp.direct_property?.address,
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
        <SidebarInset className="flex-1 w-full">
          <header className="sticky top-0 z-10 flex h-14 md:h-16 items-center gap-2 md:gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
            <SidebarTrigger className="hidden md:flex" />
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <h1 className="text-lg md:text-xl font-semibold">Komponenter</h1>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
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
                  <div className="flex gap-1 border border-border rounded-lg p-1">
                    <Button
                      variant={viewMode === "cards" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("cards")}
                      className="h-8"
                    >
                      <LayoutGrid className="h-4 w-4 mr-2" />
                      Kort
                    </Button>
                    <Button
                      variant={viewMode === "table" ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setViewMode("table")}
                      className="h-8"
                    >
                      <TableIcon className="h-4 w-4 mr-2" />
                      Tabell
                    </Button>
                  </div>
                  
                  <Badge variant="outline" className="text-base px-4 py-2">
                    {filteredComponents.length}{hasActiveFilters ? ` av ${components.length}` : ''} komponenter
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

                  {/* Filter section */}
                  {components.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Filter className="h-4 w-4" />
                        <span>Filtrera:</span>
                      </div>
                      
                      <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger className="w-[160px] h-9">
                          <SelectValue placeholder="Komponenttyp" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Alla typer</SelectItem>
                          {uniqueTypes.map(type => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={filterProperty} onValueChange={setFilterProperty}>
                        <SelectTrigger className="w-[160px] h-9">
                          <SelectValue placeholder="Fastighet" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Alla fastigheter</SelectItem>
                          {uniqueProperties.map(prop => (
                            <SelectItem key={prop} value={prop!}>{prop}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={filterManufacturer} onValueChange={setFilterManufacturer}>
                        <SelectTrigger className="w-[160px] h-9">
                          <SelectValue placeholder="Tillverkare" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Alla tillverkare</SelectItem>
                          {uniqueManufacturers.map(mfr => (
                            <SelectItem key={mfr} value={mfr!}>{mfr}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={filterModel} onValueChange={setFilterModel}>
                        <SelectTrigger className="w-[160px] h-9">
                          <SelectValue placeholder="Modell" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Alla modeller</SelectItem>
                          {uniqueModels.map(model => (
                            <SelectItem key={model} value={model!}>{model}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {hasActiveFilters && (
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
                          <X className="h-4 w-4 mr-1" />
                          Rensa filter
                        </Button>
                      )}
                    </div>
                  )}

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
                  ) : viewMode === 'cards' ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {filteredComponents.map((component) => (
                        <Card
                          key={component.id}
                          className="group hover:shadow-lg transition-all duration-300 cursor-pointer"
                          onClick={() => navigate(`/components/${component.id}`)}
                        >
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-start mb-1">
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
                        {/* Service badge - always visible */}
                        <div onClick={(e) => e.stopPropagation()}>
                          <LastServiceBadge componentId={component.id} />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {component.manufacturer && (
                            <div>
                              <span className="text-muted-foreground">Tillverkare: </span>
                              <span className="font-medium">{component.manufacturer}</span>
                            </div>
                          )}
                          {component.model && (
                            <div>
                              <span className="text-muted-foreground">Modell: </span>
                              <span className="font-medium">{component.model}</span>
                            </div>
                          )}
                          {component.installation_year && (
                            <div>
                              <span className="text-muted-foreground">Installerad: </span>
                              <span className="font-medium">{component.installation_year}</span>
                            </div>
                          )}
                          {component.room_zone && (
                            <div>
                              <span className="text-muted-foreground">Rum: </span>
                              <span className="font-medium">{component.room_zone}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="pt-3 border-t border-border space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Building2 className="h-4 w-4 text-primary" />
                            <span className="font-medium">{component.property_name}</span>
                          </div>
                          
                          {/* Floor selector - inline */}
                          <div onClick={(e) => e.stopPropagation()}>
                            {component.property_id ? (
                              <FloorSelector
                                componentId={component.id}
                                propertyId={component.property_id}
                                currentFloorId={component.floor_id}
                                onSuccess={fetchComponents}
                                compact
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground italic">Ingen fastighet</span>
                            )}
                          </div>
                          
                          {/* Action buttons - always visible now */}
                          <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-border/50">
                            <div onClick={(e) => e.stopPropagation()}>
                              <QuickServiceButton
                                componentId={component.id}
                                componentName={component.name}
                                onSuccess={fetchComponents}
                              />
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/components/${component.id}`);
                              }}
                            >
                              <Edit className="h-3.5 w-3.5 mr-1" />
                              Detaljer
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteComponent(component.id, component.name);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b text-sm text-muted-foreground">
                              <th className="text-left py-3 px-4 font-medium">Komponent</th>
                              <th className="text-left py-3 px-4 font-medium hidden md:table-cell">Typ</th>
                              <th className="text-left py-3 px-4 font-medium hidden lg:table-cell">Tillverkare</th>
                              <th className="text-left py-3 px-4 font-medium">Fastighet</th>
                              <th className="text-left py-3 px-4 font-medium">Våning</th>
                              <th className="text-left py-3 px-4 font-medium hidden sm:table-cell">Senaste service</th>
                              <th className="text-left py-3 px-4 font-medium">Status</th>
                              <th className="text-left py-3 px-4 font-medium">Åtgärder</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredComponents.map((component) => (
                              <tr 
                                key={component.id} 
                                className="border-b hover:bg-muted/50 cursor-pointer"
                                onClick={() => navigate(`/components/${component.id}`)}
                              >
                                <td className="py-3 px-4">
                                  <div className="font-medium">{component.name}</div>
                                  <div className="text-xs text-muted-foreground md:hidden">{component.type}</div>
                                  {component.room_zone && (
                                    <div className="text-xs text-muted-foreground">{component.room_zone}</div>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-sm hidden md:table-cell">{component.type}</td>
                                <td className="py-3 px-4 text-sm hidden lg:table-cell">{component.manufacturer || '-'}</td>
                                <td className="py-3 px-4">
                                  <div className="text-sm font-medium">{component.property_name}</div>
                                </td>
                                <td className="py-2 px-4" onClick={(e) => e.stopPropagation()}>
                                  {component.property_id ? (
                                    <FloorSelector
                                      componentId={component.id}
                                      propertyId={component.property_id}
                                      currentFloorId={component.floor_id}
                                      onSuccess={fetchComponents}
                                      compact
                                    />
                                  ) : (
                                    <span className="text-xs text-muted-foreground italic">-</span>
                                  )}
                                </td>
                                <td className="py-2 px-4 hidden sm:table-cell" onClick={(e) => e.stopPropagation()}>
                                  <LastServiceBadge componentId={component.id} />
                                </td>
                                <td className="py-3 px-4">
                                  <Badge className={getStatusColor(component.status)}>
                                    {getStatusText(component.status)}
                                  </Badge>
                                </td>
                                <td className="py-2 px-4">
                                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                    <QuickServiceButton
                                      componentId={component.id}
                                      componentName={component.name}
                                      onSuccess={fetchComponents}
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      onClick={() => handleDeleteComponent(component.id, component.name)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
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
