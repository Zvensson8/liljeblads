import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import {
  Package,
  Plus,
  Download,
  LayoutGrid,
  Table as TableIcon,
  Search,
  Filter,
} from 'lucide-react';
import { ComponentFormDialog } from '@/components/ComponentFormDialog';
import { SelectPropertyDialog } from '@/components/SelectPropertyDialog';
import { ComponentImportDialog } from '@/components/ComponentImportDialog';
import { exportComponentsToExcel, exportComponentsToPDF } from '@/lib/exportUtils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useComponents, useDeleteComponent } from '@/hooks/useComponents';
import { useLastServiceByComponent, useMaintenanceHistory } from '@/hooks/useMaintenanceHistory';
import { useWorkOrders } from '@/hooks/useWorkOrders';
import { useComponentRiskList } from '@/hooks/useComponentRisk';
import { useProperties } from '@/hooks/useProperties';
import { useOrganization } from '@/hooks/useOrganization';
import { useIsMobile } from '@/hooks/use-mobile';
import { useListSearchParams } from '@/hooks/useListSearchParams';
import { toast } from 'sonner';
import {
  filterAndSortComponents,
  hasActiveComponentFilters,
  uniqueComponentManufacturers,
  uniqueComponentModels,
  uniqueComponentTypes,
  type ServiceFilter,
  type ComponentsSort,
} from '@/lib/componentsListFilter';
import type { RiskLevel } from '@/lib/componentRisk';
import { generateRiskSuggestions } from '@/lib/riskSuggestions';
import { componentPath } from '@/lib/entityPaths';
import { queryKeys } from '@/lib/queryKeys';
import { maintenanceHistoryService } from '@/services/supabase';
import { EntityListHeader } from '@/components/list/EntityListHeader';
import {
  EntityListEmpty,
  EntityListError,
  EntityListSkeleton,
} from '@/components/list/EntityListState';
import { ComponentsFiltersBar } from '@/components/components-list/ComponentsFiltersBar';
import { ComponentsCardsView } from '@/components/components-list/ComponentsCardsView';
import { ComponentsTableView } from '@/components/components-list/ComponentsTableView';

const LIST_DEFAULTS = {
  tab: 'components',
  q: '',
  property: 'all',
  type: 'all',
  manufacturer: 'all',
  model: 'all',
  service: 'all',
  risk: 'all',
  sort: 'default',
};

const SERVICE_VALUES: ServiceFilter[] = ['all', 'latest', 'none', 'with_service'];
const RISK_VALUES: Array<'all' | RiskLevel> = ['all', 'low', 'medium', 'high', 'critical'];
const SORT_VALUES: ComponentsSort[] = ['default', 'risk'];
const TABS = ['components', 'costs'] as const;

function asService(value: string): ServiceFilter {
  return SERVICE_VALUES.includes(value as ServiceFilter) ? (value as ServiceFilter) : 'all';
}

function asRisk(value: string): 'all' | RiskLevel {
  return RISK_VALUES.includes(value as 'all' | RiskLevel) ? (value as 'all' | RiskLevel) : 'all';
}

function asSort(value: string): ComponentsSort {
  return SORT_VALUES.includes(value as ComponentsSort) ? (value as ComponentsSort) : 'default';
}

type ListComponent = {
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
  property_id?: string;
  property_name?: string;
  property_address?: string | null;
  notes?: string | null;
};

const Components = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [params, setParam, setMany] = useListSearchParams(LIST_DEFAULTS);
  const activeTab = TABS.includes(params.tab as (typeof TABS)[number])
    ? params.tab
    : 'components';

  const [selectedComponent, setSelectedComponent] = useState<ListComponent | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectPropertyDialogOpen, setSelectPropertyDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [suggesting, setSuggesting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ListComponent | null>(null);

  useEffect(() => {
    if (isMobile) setViewMode('cards');
  }, [isMobile]);

  const {
    data: rawComponents = [],
    isLoading,
    isError,
    refetch,
  } = useComponents();
  const { data: properties = [] } = useProperties();
  const { data: lastServiceById = {} } = useLastServiceByComponent();
  const costsEnabled = activeTab === 'costs';
  const { data: maintenanceRows = [] } = useMaintenanceHistory({}, { enabled: costsEnabled });
  const { data: workOrders = [] } = useWorkOrders({}, { enabled: costsEnabled });

  const propertyId = params.property !== 'all' ? params.property : undefined;
  const { data: riskList = [] } = useComponentRiskList(
    { propertyId, limit: 200 },
    { enabled: Boolean(propertyId) },
  );
  const { organization } = useOrganization();
  const deleteComponent = useDeleteComponent();

  const riskById = useMemo(() => {
    const m = new Map<string, (typeof riskList)[0]>();
    for (const r of riskList) m.set(r.componentId, r);
    return m;
  }, [riskList]);

  const components: ListComponent[] = useMemo(
    () =>
      rawComponents
        .filter((comp) => Boolean(comp.id))
        .map((comp) => ({
          ...comp,
          id: String(comp.id),
          name: comp.name ?? '',
          type: String(comp.type ?? ''),
          status: String(comp.status ?? 'active'),
          manufacturer: comp.manufacturer ?? null,
          model: comp.model ?? null,
          serial_number: comp.serial_number ?? null,
          room_zone: comp.room_zone ?? null,
          installation_year: comp.installation_year ?? null,
          registration_number: comp.registration_number ?? null,
          refrigerant_code: comp.refrigerant_code ?? null,
          refrigerant_amount_kg: comp.refrigerant_amount_kg ?? null,
          refrigerant_type: comp.refrigerant_type ?? null,
          property_name: comp.properties?.name,
          property_address: comp.properties?.address,
        })),
    [rawComponents],
  );

  const maintenanceStats = useMemo(() => {
    const stats: Record<string, { lastDate: string | null }> = {};
    for (const [id, date] of Object.entries(lastServiceById)) {
      stats[id] = { lastDate: date };
    }
    return stats;
  }, [lastServiceById]);

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

  const costStats = useMemo(() => {
    const stats: Record<string, { totalCost: number; count: number }> = {};
    maintenanceRows.forEach((row) => {
      if (!row.component_id) return;
      if (!stats[row.component_id]) {
        stats[row.component_id] = { totalCost: 0, count: 0 };
      }
      stats[row.component_id].totalCost += row.cost || 0;
      stats[row.component_id].count += 1;
    });
    return stats;
  }, [maintenanceRows]);

  const uniqueTypes = useMemo(() => uniqueComponentTypes(components), [components]);
  const uniqueManufacturers = useMemo(
    () => uniqueComponentManufacturers(components),
    [components],
  );
  const uniqueModels = useMemo(() => uniqueComponentModels(components), [components]);
  const sortedProperties = useMemo(
    () => [...properties].sort((a, b) => a.name.localeCompare(b.name, 'sv')),
    [properties],
  );

  const effectiveRisk = propertyId ? asRisk(params.risk) : 'all';
  const effectiveSort = propertyId ? asSort(params.sort) : 'default';

  const listFilters = useMemo(
    () => ({
      searchQuery: params.q,
      filterType: params.type,
      filterProperty: params.property,
      filterManufacturer: params.manufacturer,
      filterModel: params.model,
      filterService: asService(params.service),
      filterRisk: effectiveRisk,
      sortBy: effectiveSort,
    }),
    [
      params.q,
      params.type,
      params.property,
      params.manufacturer,
      params.model,
      params.service,
      effectiveRisk,
      effectiveSort,
    ],
  );

  const filteredComponents = useMemo(
    () => filterAndSortComponents(components, listFilters, maintenanceStats, riskById),
    [components, listFilters, maintenanceStats, riskById],
  );

  const hasActiveFilters = hasActiveComponentFilters(listFilters);

  const clearFilters = () => {
    setMany({
      q: '',
      property: 'all',
      type: 'all',
      manufacturer: 'all',
      model: 'all',
      service: 'all',
      risk: 'all',
      sort: 'default',
    });
  };

  const handleGenerateRiskSuggestions = async () => {
    if (!organization?.id) {
      toast.error('Ingen organisation hittades');
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
        toast.success(`${res.created} riskförslag skapade — granska i AI-inkorgen`);
      } else {
        toast.info(
          res.skipped
            ? `Inga nya förslag (${res.skipped} hoppades över p.g.a. dedupe/filter)`
            : 'Inga högriskkomponenter att föreslå',
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kunde inte generera riskförslag');
    } finally {
      setSuggesting(false);
    }
  };

  const handleExport = async (format: 'excel' | 'pdf') => {
    const exportList = filteredComponents.length > 0 ? filteredComponents : components;
    if (exportList.length === 0) {
      toast.error('Inga komponenter att exportera');
      return;
    }
    try {
      const historyRows = await maintenanceHistoryService.list({});
      const exportIds = new Set(exportList.map((c) => c.id));
      const maintenanceRecords: Record<string, typeof historyRows> = {};
      exportList.forEach((c) => {
        maintenanceRecords[c.id] = [];
      });
      historyRows.forEach((row) => {
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
          `komponenter-${datestamp}.xlsx`,
        );
      } else {
        exportComponentsToPDF(
          exportList,
          maintenanceRecords as Parameters<typeof exportComponentsToPDF>[1],
          'Komponentregister',
          `komponenter-${datestamp}.pdf`,
        );
      }
      toast.success(`${exportList.length} komponenter exporterade`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kunde inte exportera');
    }
  };

  const handleNewComponent = () => {
    if (params.property !== 'all') {
      setSelectedComponent(null);
      setDialogOpen(true);
      return;
    }
    setSelectPropertyDialogOpen(true);
  };

  const handlePropertySelected = (nextPropertyId: string) => {
    setParam('property', nextPropertyId);
    setSelectPropertyDialogOpen(false);
    setSelectedComponent(null);
    setDialogOpen(true);
  };

  const handleDeleteComponent = async () => {
    if (!deleteTarget) return;
    try {
      await deleteComponent.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // hook toasts
    }
  };

  const refreshListExtras = () => {
    void queryClient.invalidateQueries({
      queryKey: [...queryKeys.maintenanceHistory.all, 'last-service'],
    });
  };

  const filterBar = (
    <ComponentsFiltersBar
      uniqueTypes={uniqueTypes}
      properties={sortedProperties.map((p) => ({ id: p.id, name: p.name }))}
      uniqueManufacturers={uniqueManufacturers}
      uniqueModels={uniqueModels}
      filterType={params.type}
      filterProperty={params.property}
      filterManufacturer={params.manufacturer}
      filterModel={params.model}
      filterService={asService(params.service)}
      filterRisk={effectiveRisk}
      sortBy={effectiveSort}
      hasActiveFilters={hasActiveFilters}
      suggesting={suggesting}
      riskDisabled={!propertyId}
      riskListEmpty={riskList.length === 0}
      onFilterType={(v) => setParam('type', v)}
      onFilterProperty={(v) => setParam('property', v)}
      onFilterManufacturer={(v) => setParam('manufacturer', v)}
      onFilterModel={(v) => setParam('model', v)}
      onFilterService={(v) => setParam('service', v)}
      onFilterRisk={(v) => setParam('risk', v)}
      onSortBy={(v) => setParam('sort', v)}
      onClearFilters={clearFilters}
      onGenerateRiskSuggestions={() => void handleGenerateRiskSuggestions()}
    />
  );

  const costRows = useMemo(
    () =>
      [...components]
        .map((c) => ({
          ...c,
          totalCost:
            (costStats[c.id]?.totalCost || 0) + (workOrderStats[c.id]?.totalPrice || 0),
          serviceCount: costStats[c.id]?.count || 0,
          woCount: workOrderStats[c.id]?.count || 0,
        }))
        .filter((c) => c.totalCost > 0)
        .sort((a, b) => b.totalCost - a.totalCost),
    [components, costStats, workOrderStats],
  );

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 w-full">
          <header className="sticky top-0 z-10 flex h-14 md:h-16 items-center gap-2 md:gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
            <SidebarTrigger className="hidden md:flex" />
            <EntityListHeader
              icon={<Package className="h-5 w-5 text-primary shrink-0" />}
              title="Komponenter"
              actions={
                <>
                  <ComponentImportDialog onSuccess={() => void refetch()} />
                  {components.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size={isMobile ? 'sm' : 'default'}>
                          <Download className="h-4 w-4 mr-2" />
                          Exportera
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onClick={() => void handleExport('excel')}>
                          Exportera till Excel
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => void handleExport('pdf')}>
                          Exportera till PDF
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Button size={isMobile ? 'sm' : 'default'} onClick={handleNewComponent}>
                    <Plus className="h-4 w-4 mr-2" />
                    Ny komponent
                  </Button>
                </>
              }
            />
          </header>

          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
            <div className="max-w-7xl mx-auto space-y-6">
              <Tabs
                value={activeTab}
                onValueChange={(tab) => setParam('tab', tab)}
                className="w-full"
              >
                <TabsList>
                  <TabsTrigger value="components">Komponenter</TabsTrigger>
                  <TabsTrigger value="costs">Kostnadsöversikt</TabsTrigger>
                </TabsList>

                <TabsContent value="components" className="space-y-6">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3 flex-wrap w-full">
                      <div className="relative w-full md:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Sök namn, typ, tillverkare…"
                          className="pl-10"
                          value={params.q}
                          onChange={(e) => setParam('q', e.target.value)}
                        />
                      </div>
                      {isMobile && (
                        <Sheet>
                          <SheetTrigger asChild>
                            <Button variant="outline" className="h-10">
                              <Filter className="h-4 w-4 mr-2" />
                              Filter
                              {hasActiveFilters && (
                                <Badge
                                  variant="secondary"
                                  className="ml-2 h-5 min-w-5 px-1.5 text-xs"
                                >
                                  !
                                </Badge>
                              )}
                            </Button>
                          </SheetTrigger>
                          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
                            <SheetHeader>
                              <SheetTitle>Filter</SheetTitle>
                            </SheetHeader>
                            <div className="mt-4">{filterBar}</div>
                          </SheetContent>
                        </Sheet>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1 border border-border rounded-lg p-1">
                        <Button
                          variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => setViewMode('cards')}
                          className="h-8"
                        >
                          <LayoutGrid className="h-4 w-4 mr-2" />
                          Kort
                        </Button>
                        <Button
                          variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                          size="sm"
                          onClick={() => setViewMode('table')}
                          className="h-8"
                        >
                          <TableIcon className="h-4 w-4 mr-2" />
                          Tabell
                        </Button>
                      </div>
                      <Badge variant="outline" className="text-sm px-3 py-1">
                        {filteredComponents.length}
                        {hasActiveFilters ? ` av ${components.length}` : ''} komponenter
                      </Badge>
                    </div>
                  </div>

                  {!isMobile && components.length > 0 && filterBar}

                  {isLoading ? (
                    <EntityListSkeleton />
                  ) : isError ? (
                    <EntityListError onRetry={() => void refetch()} />
                  ) : components.length === 0 ? (
                    <EntityListEmpty
                      title="Inga komponenter än"
                      description="Lägg till den första från en fastighet."
                      action={
                        <Button onClick={handleNewComponent}>
                          <Plus className="h-4 w-4 mr-2" />
                          Ny komponent
                        </Button>
                      }
                    />
                  ) : filteredComponents.length === 0 ? (
                    <EntityListEmpty
                      title="Inget matchar"
                      description={
                        !propertyId && asRisk(params.risk) !== 'all'
                          ? 'Välj en fastighet för att filtrera på risk.'
                          : 'Prova ett annat sökord eller filter.'
                      }
                      action={
                        <Button variant="outline" onClick={clearFilters}>
                          Rensa filter
                        </Button>
                      }
                    />
                  ) : viewMode === 'cards' ? (
                    <ComponentsCardsView
                      components={filteredComponents}
                      riskById={riskById}
                      lastServiceById={lastServiceById}
                    />
                  ) : (
                    <ComponentsTableView
                      components={filteredComponents}
                      riskById={riskById}
                      lastServiceById={lastServiceById}
                      onDelete={(_id, _name) => {
                        const found = filteredComponents.find((c) => c.id === _id) ?? null;
                        setDeleteTarget(found);
                      }}
                      onRefresh={refreshListExtras}
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
                      {costRows.length === 0 ? (
                        <p className="text-center py-8 text-muted-foreground">
                          Ingen kostnadsdata registrerad ännu
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {costRows.map((c) => (
                            <div
                              key={c.id}
                              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                              onClick={() => navigate(componentPath(c.id))}
                            >
                              <div>
                                <p className="font-medium">{c.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {c.property_name} · {c.serviceCount} åtgärder · {c.woCount}{' '}
                                  arbetsordrar
                                </p>
                              </div>
                              <p className="font-semibold">
                                {c.totalCost.toLocaleString('sv-SE')} kr
                              </p>
                            </div>
                          ))}
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

      <SelectPropertyDialog
        open={selectPropertyDialogOpen}
        onOpenChange={setSelectPropertyDialogOpen}
        onSelect={handlePropertySelected}
      />

      <ComponentFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setSelectedComponent(null);
        }}
        propertyId={selectedComponent?.property_id || propertyId || ''}
        editingComponent={selectedComponent}
        onSuccess={() => {
          setDialogOpen(false);
          setSelectedComponent(null);
          void refetch();
        }}
      />

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort komponent?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.name}” tas bort. Servicehistorik och kopplade poster kan påverkas.
              Det går inte att ångra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDeleteComponent()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
};

export default Components;
