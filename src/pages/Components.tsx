import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { useAuth } from '@/hooks/useAuth';
import { Package, Plus, Download, LayoutGrid, Table as TableIcon } from 'lucide-react';
import { ComponentFormDialog } from '@/components/ComponentFormDialog';
import { SelectPropertyFloorDialog } from '@/components/SelectPropertyFloorDialog';
import { ComponentImportDialog } from '@/components/ComponentImportDialog';
import { exportComponentsToExcel, exportComponentsToPDF } from '@/lib/exportUtils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useComponents, useDeleteComponent } from '@/hooks/useComponents';
import { useMaintenanceHistory } from '@/hooks/useMaintenanceHistory';
import { useWorkOrders } from '@/hooks/useWorkOrders';
import { useComponentRiskList } from '@/hooks/useComponentRisk';
import { type RiskLevel } from '@/lib/componentRisk';
import { generateRiskSuggestions } from '@/lib/riskSuggestions';
import { useOrganization } from '@/hooks/useOrganization';
import { toast as sonnerToast } from 'sonner';
import {
  filterAndSortComponents,
  hasActiveComponentFilters,
  type ServiceFilter,
  type ComponentsSort,
} from '@/lib/componentsListFilter';
import { ComponentsFiltersBar } from '@/components/components-list/ComponentsFiltersBar';
import { ComponentsCardsView } from '@/components/components-list/ComponentsCardsView';
import { ComponentsTableView } from '@/components/components-list/ComponentsTableView';

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
  const [filterService, setFilterService] = useState<ServiceFilter>('all');
  const [filterRisk, setFilterRisk] = useState<'all' | RiskLevel>('all');
  const [sortBy, setSortBy] = useState<ComponentsSort>('default');
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  const { data: rawComponents = [], isLoading: componentsLoading } = useComponents();
  const { data: maintenanceRows = [] } = useMaintenanceHistory();
  const { data: workOrders = [] } = useWorkOrders();
  const { data: riskList = [] } = useComponentRiskList({ limit: 500 });
  const { organization } = useOrganization();
  const deleteComponent = useDeleteComponent();

  const riskById = useMemo(() => {
    const m = new Map<string, (typeof riskList)[0]>();
    for (const r of riskList) m.set(r.componentId, r);
    return m;
  }, [riskList]);

  const components: Component[] = useMemo(
    () =>
      rawComponents.map((comp) => ({
        ...comp,
        floor_name: comp.floors?.name,
        floor_level: comp.floors?.level,
        property_name: comp.properties?.name,
        property_address: comp.properties?.address,
      })) as Component[],
    [rawComponents],
  );

  const maintenanceStats = useMemo(() => {
    const stats: Record<string, { totalCost: number; count: number; lastDate: string | null }> = {};
    maintenanceRows.forEach((row) => {
      if (!row.component_id) return;
      if (!stats[row.component_id]) {
        stats[row.component_id] = { totalCost: 0, count: 0, lastDate: null };
      }
      stats[row.component_id].totalCost += row.cost || 0;
      stats[row.component_id].count += 1;
      if (!stats[row.component_id].lastDate || row.performed_date > stats[row.component_id].lastDate!) {
        stats[row.component_id].lastDate = row.performed_date;
      }
    });
    return stats;
  }, [maintenanceRows]);

  const workOrderStats = useMemo(() => {
    const stats: Record<string, { count: number; totalPrice: number }> = {};
    workOrders.forEach((row) => {
      if (!row.component_id) return;
      if (!stats[row.component_id]) {
        stats[row.component_id] = { count: 0, totalPrice: 0 };
      }
      stats[row.component_id].count += 1;
      stats[row.component_id].totalPrice += row.price || 0;
    });
    return stats;
  }, [workOrders]);

  const loading = componentsLoading;

  // Get unique values for filter dropdowns
  const uniqueTypes = [...new Set(components.map(c => c.type))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'sv'));
  const uniqueProperties = [...new Set(components.map(c => c.property_name))].filter(Boolean).sort((a, b) => (a || '').localeCompare(b || '', 'sv'));
  const uniqueManufacturers = [...new Set(components.map(c => c.manufacturer))].filter(Boolean).sort((a, b) => (a || '').localeCompare(b || '', 'sv'));
  const uniqueModels = [...new Set(components.map(c => c.model))].filter(Boolean).sort((a, b) => (a || '').localeCompare(b || '', 'sv'));

  const listFilters = useMemo(
    () => ({
      filterType,
      filterProperty,
      filterManufacturer,
      filterModel,
      filterService,
      filterRisk,
      sortBy,
    }),
    [
      filterType,
      filterProperty,
      filterManufacturer,
      filterModel,
      filterService,
      filterRisk,
      sortBy,
    ],
  );

  const filteredComponents = useMemo(
    () =>
      filterAndSortComponents(
        components,
        listFilters,
        maintenanceStats,
        riskById,
      ),
    [components, listFilters, maintenanceStats, riskById],
  );

  const hasActiveFilters = hasActiveComponentFilters(listFilters);

  const clearFilters = () => {
    setFilterType('all');
    setFilterProperty('all');
    setFilterManufacturer('all');
    setFilterModel('all');
    setFilterService('all');
    setFilterRisk('all');
    setSortBy('default');
  };

  const handleGenerateRiskSuggestions = async () => {
    if (!organization?.id) {
      sonnerToast.error('Ingen organisation hittades');
      return;
    }
    setSuggesting(true);
    try {
      const res = await generateRiskSuggestions({
        organizationId: organization.id,
        risks: riskList,
        maxSuggestions: 20,
      });
      if (res.created > 0) {
        sonnerToast.success(
          `${res.created} riskförslag skapade — granska i AI-inkorgen`,
        );
      } else {
        sonnerToast.info(
          res.skipped
            ? `Inga nya förslag (${res.skipped} hoppades över p.g.a. dedupe/filter)`
            : 'Inga högriskkomponenter att föreslå',
        );
      }
    } catch (e) {
      sonnerToast.error(
        e instanceof Error ? e.message : 'Kunde inte generera riskförslag',
      );
    } finally {
      setSuggesting(false);
    }
  };

  const handleExport = async (format: 'excel' | 'pdf') => {
    const exportList = filteredComponents.length > 0 ? filteredComponents : components;
    const exportIds = new Set(exportList.map((c) => c.id));

    const maintenanceRecords: Record<string, typeof maintenanceRows> = {};
    exportList.forEach((c) => (maintenanceRecords[c.id] = []));
    maintenanceRows.forEach((row) => {
      if (!row.component_id || !exportIds.has(row.component_id)) return;
      maintenanceRecords[row.component_id].push(row);
    });
    Object.values(maintenanceRecords).forEach((arr) =>
      arr.sort((a, b) => (b.performed_date || '').localeCompare(a.performed_date || '')),
    );

    const datestamp = new Date().toISOString().split('T')[0];
    if (format === 'excel') {
      await exportComponentsToExcel(
        exportList,
        maintenanceRecords as Parameters<typeof exportComponentsToExcel>[1],
        `komponenter-${datestamp}.xlsx`
      );
      toast({
        title: 'Export lyckades',
        description: `${exportList.length} komponenter exporterade till Excel`,
      });
    } else {
      exportComponentsToPDF(
        exportList,
        maintenanceRecords as Parameters<typeof exportComponentsToPDF>[1],
        'Komponentregister',
        `komponenter-${datestamp}.pdf`
      );
      toast({
        title: 'Export lyckades',
        description: `${exportList.length} komponenter exporterade till PDF`,
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

  const handleDeleteComponent = (componentId: string, componentName: string) => {
    if (!confirm(`Är du säker på att du vill ta bort ${componentName}?`)) {
      return;
    }
    deleteComponent.mutate(componentId);
  };

  const refreshComponents = () => {
    // react-query realtime + mutation invalidations handle refetch automatically.
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
                  <ComponentImportDialog onSuccess={refreshComponents} />
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

                  {components.length > 0 && (
                    <ComponentsFiltersBar
                      uniqueTypes={uniqueTypes}
                      uniqueProperties={uniqueProperties as string[]}
                      uniqueManufacturers={uniqueManufacturers as string[]}
                      uniqueModels={uniqueModels as string[]}
                      filterType={filterType}
                      filterProperty={filterProperty}
                      filterManufacturer={filterManufacturer}
                      filterModel={filterModel}
                      filterService={filterService}
                      filterRisk={filterRisk}
                      sortBy={sortBy}
                      hasActiveFilters={hasActiveFilters}
                      suggesting={suggesting}
                      riskListEmpty={riskList.length === 0}
                      onFilterType={setFilterType}
                      onFilterProperty={setFilterProperty}
                      onFilterManufacturer={setFilterManufacturer}
                      onFilterModel={setFilterModel}
                      onFilterService={setFilterService}
                      onFilterRisk={setFilterRisk}
                      onSortBy={setSortBy}
                      onClearFilters={clearFilters}
                      onGenerateRiskSuggestions={handleGenerateRiskSuggestions}
                    />
                  )}

                  {components.length === 0 ? (
                    <Card className="text-center py-16 border-dashed">
                      <CardContent>
                        <div className="inline-flex p-4 rounded-full bg-primary/10 text-primary mb-4">
                          <Package className="h-8 w-8" />
                        </div>
                        <CardTitle className="mb-2 text-xl">Inga komponenter ännu</CardTitle>
                        <CardDescription className="text-base mb-4">
                          Lägg till komponenter från en fastighet eller med knappen ovan
                        </CardDescription>
                        <Button onClick={() => navigate('/properties')}>
                          Gå till Fastigheter
                        </Button>
                      </CardContent>
                    </Card>
                  ) : viewMode === 'cards' ? (
                    <ComponentsCardsView
                      components={filteredComponents}
                      riskById={riskById}
                      maintenanceStats={maintenanceStats}
                      workOrderStats={workOrderStats}
                    />
                  ) : (
                    <ComponentsTableView
                      components={filteredComponents}
                      riskById={riskById}
                      maintenanceStats={maintenanceStats}
                      workOrderStats={workOrderStats}
                      onDelete={handleDeleteComponent}
                      onRefresh={refreshComponents}
                      getStatusColor={getStatusColor}
                      getStatusText={getStatusText}
                    />
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
                    {components.length === 0 ? (
                      <p className="text-center py-8 text-muted-foreground">Inga komponenter att visa</p>
                    ) : (
                      <div className="space-y-2">
                        {[...components]
                          .map(c => ({
                            ...c,
                            totalCost: (maintenanceStats[c.id]?.totalCost || 0) + (workOrderStats[c.id]?.totalPrice || 0),
                            serviceCount: (maintenanceStats[c.id]?.count || 0),
                            woCount: (workOrderStats[c.id]?.count || 0),
                          }))
                          .filter(c => c.totalCost > 0)
                          .sort((a, b) => b.totalCost - a.totalCost)
                          .map(c => (
                            <div
                              key={c.id}
                              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                              onClick={() => navigate(`/components/${c.id}`)}
                            >
                              <div>
                                <p className="font-medium">{c.name}</p>
                                <p className="text-sm text-muted-foreground">{c.property_name} · {c.serviceCount} åtgärder · {c.woCount} arbetsordrar</p>
                              </div>
                              <p className="font-semibold">{c.totalCost.toLocaleString('sv-SE')} kr</p>
                            </div>
                          ))}
                        {components.every(c => ((maintenanceStats[c.id]?.totalCost || 0) + (workOrderStats[c.id]?.totalPrice || 0)) === 0) && (
                          <p className="text-center py-8 text-muted-foreground">Ingen kostnadsdata registrerad ännu</p>
                        )}
                      </div>
                    )}
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
          refreshComponents();
        }}
      />
    </SidebarProvider>
  );
};

export default Components;
