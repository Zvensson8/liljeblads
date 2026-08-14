import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useIsMobile } from '@/hooks/use-mobile';
import { AppSidebar } from '@/components/AppSidebar';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Search,
  Archive,
  LayoutGrid,
  Table as TableIcon,
  Wrench,
  Filter,
  Building2,
  Download,
  CreditCard,
} from 'lucide-react';
import { WorkOrderDialog } from '@/components/WorkOrderDialog';
import { WorkOrderDetailDialog } from '@/components/WorkOrderDetailDialog';
import { WorkOrderKanban } from '@/components/WorkOrderKanban';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useWorkOrders,
  useUpdateWorkOrder,
  useDeleteWorkOrder,
} from '@/hooks/useWorkOrders';
import type { UpdateWorkOrderInput } from '@/types/domain';
import { exportWorkOrdersToExcel } from '@/lib/exportUtils';
import { filterWorkOrders, uniqueContractors } from '@/lib/workOrdersListFilter';
import { workOrderPriorityBadge, workOrderStatusLabel } from '@/lib/workOrderLabels';
import { EntityListHeader } from '@/components/list/EntityListHeader';
import {
  EntityListEmpty,
  EntityListError,
  EntityListSkeleton,
} from '@/components/list/EntityListState';
import { useListSearchParams } from '@/hooks/useListSearchParams';
import { useProperties } from '@/hooks/useProperties';
import { queryKeys } from '@/lib/queryKeys';

type WorkOrderRow = NonNullable<ReturnType<typeof useWorkOrders>['data']>[number];
type ViewMode = 'kanban' | 'table' | 'cards';

const LIST_DEFAULTS = {
  q: '',
  property: 'all',
  status: 'all',
  contractor: 'all',
  archived: '0',
};

const WorkOrders = () => {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [params, setParam, setMany] = useListSearchParams(LIST_DEFAULTS);
  const showArchived = params.archived === '1';
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<WorkOrderRow | null>(null);
  const [detailOrder, setDetailOrder] = useState<WorkOrderRow | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [editingCell, setEditingCell] = useState<{ orderId: string; field: string } | null>(
    null,
  );
  const [tempValue, setTempValue] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (isMobile) setViewMode((v) => (v === 'cards' ? v : 'cards'));
  }, [isMobile]);

  const {
    data: workOrders,
    isLoading,
    isError,
    refetch: refetchQuery,
  } = useWorkOrders({ showArchived });
  const { data: properties = [] } = useProperties();
  const updateMutation = useUpdateWorkOrder();
  const deleteMutation = useDeleteWorkOrder();
  const updating = updateMutation.isPending;

  const refetch = () => {
    void refetchQuery();
    void queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.all });
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
    } catch {
      // hook surfaces error toast
    }
  };

  const listFilters = useMemo(
    () => ({
      searchQuery: params.q,
      propertyId: params.property,
      contractor: params.contractor,
      status: params.status,
    }),
    [params.q, params.property, params.contractor, params.status],
  );

  const applyFilters = (orders: WorkOrderRow[]) => filterWorkOrders(orders, listFilters);

  const allOrders = workOrders ?? [];
  const filteredAll = useMemo(
    () => filterWorkOrders(allOrders, listFilters),
    [allOrders, listFilters],
  );

  const notStarted = allOrders.filter((wo) => wo.status === 'not_started');
  const awaitingQuote = allOrders.filter((wo) => wo.status === 'awaiting_quote');
  const ordered = allOrders.filter((wo) => wo.status === 'ordered');
  const completed = allOrders.filter((wo) => wo.status === 'completed');
  const archived = allOrders.filter((wo) => wo.status === 'archived');

  const contractors = useMemo(() => uniqueContractors(allOrders), [allOrders]);
  const sortedProperties = useMemo(
    () => [...properties].sort((a, b) => a.name.localeCompare(b.name, 'sv')),
    [properties],
  );

  const activeCount = allOrders.filter((wo) => wo.status !== 'archived').length;
  const activeFilterCount =
    (params.property !== 'all' ? 1 : 0) +
    (params.contractor !== 'all' ? 1 : 0) +
    (params.status !== 'all' ? 1 : 0);

  const clearAllFilters = () => {
    setMany({ property: 'all', contractor: 'all', status: 'all', q: '' });
  };

  const prefillPropertyId = params.property !== 'all' ? params.property : undefined;

  const handleExportExcel = async () => {
    if (filteredAll.length === 0) {
      toast.error('Inga arbetsordrar att exportera med nuvarande filter');
      return;
    }
    setExporting(true);
    try {
      await exportWorkOrdersToExcel(
        filteredAll.map((wo) => ({
          action: wo.action,
          status: wo.status,
          priority: wo.priority,
          contractor: wo.contractor,
          price: wo.price,
          due_date: wo.due_date,
          quarter: wo.quarter,
          comments: wo.comments,
          property_name: wo.properties?.name ?? null,
          component_name: wo.components?.name ?? null,
          created_at: wo.created_at,
        })),
      );
      toast.success(`${filteredAll.length} arbetsordrar exporterade`);
    } catch {
      toast.error('Kunde inte exportera arbetsordrar');
    } finally {
      setExporting(false);
    }
  };

  const updateWorkOrder = async (orderId: string, field: string, value: unknown) => {
    try {
      if (field === 'status' && value === 'completed') {
        const { completeWorkOrderWithCost } = await import('@/lib/completeWorkOrder');
        const result = await completeWorkOrderWithCost({ workOrderId: orderId });
        await queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.all });
        const riskNote =
          result.riskAfter != null
            ? ` Risk efteråt: ${result.riskAfter.riskLevel} (${result.riskAfter.riskScore}).`
            : '';
        const closed = result.riskFeedback?.closedSuggestions
          ? ` ${result.riskFeedback.closedSuggestions} riskförslag stängda.`
          : '';
        toast.success(
          result.costRegistered != null
            ? `Slutförd. Kostnad ${result.costRegistered.toLocaleString('sv-SE')} kr på komponenten.${riskNote}${closed}`
            : result.maintenanceHistoryId
              ? `Slutförd och kopplad till servicehistorik.${riskNote}${closed}`
              : 'Arbetsorder markerad som slutförd (ingen komponent kopplad).',
        );
        await queryClient.invalidateQueries({ queryKey: ['component-risk-list'] });
        if (result.workOrder.component_id) {
          await queryClient.invalidateQueries({
            queryKey: queryKeys.components.detail(result.workOrder.component_id),
          });
        }
      } else {
        await updateMutation.mutateAsync({
          id: orderId,
          patch: { [field]: value } as UpdateWorkOrderInput,
        });
        toast.success('Arbetsorder uppdaterad');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Uppdatering misslyckades';
      toast.error(msg);
    } finally {
      setEditingCell(null);
      setTempValue(null);
    }
  };

  const startEditing = (orderId: string, field: string, currentValue: string | number | null) => {
    setEditingCell({ orderId, field });
    setTempValue(currentValue == null ? null : String(currentValue));
  };

  const handleKeyDown = (e: React.KeyboardEvent, orderId: string, field: string) => {
    if (e.key === 'Enter' && tempValue !== null) {
      void updateWorkOrder(
        orderId,
        field,
        field === 'price' ? parseFloat(tempValue) || null : tempValue,
      );
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setTempValue(null);
    }
  };

  const getPriorityBorderColor = (priority: string) => {
    const colors: Record<string, string> = {
      high: 'border-l-red-500',
      medium: 'border-l-yellow-500',
      low: 'border-l-green-500',
    };
    return colors[priority] || 'border-l-transparent';
  };

  const openDetail = (order: WorkOrderRow) => {
    setDetailOrder(order);
    setDetailDialogOpen(true);
  };

  const sectionTotal = (orders: WorkOrderRow[]) =>
    applyFilters(orders).reduce((sum, wo) => sum + (Number(wo.price) || 0), 0);

  const renderOrdersTable = (orders: WorkOrderRow[], title: string, icon: string) => {
    const tableOrders = applyFilters(orders);
    const total = sectionTotal(orders);

    return (
      <Card className="border-border">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <span>{icon}</span>
              {title}
            </CardTitle>
            <div className="text-sm text-muted-foreground">
              {tableOrders.length} ordrar
              {total > 0 && ` • ${total.toLocaleString('sv-SE')} kr`}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {tableOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
              Inga arbetsordrar
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b text-sm text-muted-foreground">
                    <th className="text-left py-3 px-3 font-medium">Åtgärd</th>
                    <th className="text-left py-3 px-3 font-medium">Fastighet</th>
                    <th className="text-left py-3 px-3 font-medium">Status</th>
                    <th className="text-left py-3 px-3 font-medium">Pris</th>
                    <th className="text-left py-3 px-3 font-medium">Datum</th>
                  </tr>
                </thead>
                <tbody>
                  {tableOrders.map((order) => (
                    <tr
                      key={order.id}
                      className={`border-b border-l-4 ${getPriorityBorderColor(order.priority)} hover:bg-muted/50 cursor-pointer transition-colors`}
                      onClick={() => openDetail(order)}
                    >
                      <td className="py-3 px-3 font-medium">
                        <div>{order.action}</div>
                        {order.components?.name && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {order.components.name}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span>{order.properties?.name ?? '—'}</span>
                        </div>
                      </td>
                      <td
                        className="py-3 px-3"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(order.id, 'status', order.status);
                        }}
                      >
                        {editingCell?.orderId === order.id && editingCell?.field === 'status' ? (
                          <Select
                            value={tempValue ?? undefined}
                            onValueChange={(value) => {
                              setTempValue(value);
                              void updateWorkOrder(order.id, 'status', value);
                            }}
                            disabled={updating}
                          >
                            <SelectTrigger className="h-8 w-36" onClick={(e) => e.stopPropagation()}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not_started">Ej påbörjad</SelectItem>
                              <SelectItem value="awaiting_quote">Inväntar offert</SelectItem>
                              <SelectItem value="ordered">Beställt</SelectItem>
                              <SelectItem value="completed">Slutförd</SelectItem>
                              <SelectItem value="archived">Arkiverad</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant="outline"
                            className="hover:bg-muted cursor-pointer transition-colors"
                          >
                            {workOrderStatusLabel(order.status)}
                          </Badge>
                        )}
                      </td>
                      <td
                        className="py-3 px-3"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(order.id, 'price', order.price?.toString() || '');
                        }}
                      >
                        {editingCell?.orderId === order.id && editingCell?.field === 'price' ? (
                          <Input
                            type="number"
                            value={tempValue ?? ''}
                            onChange={(e) => setTempValue(e.target.value)}
                            onBlur={() =>
                              void updateWorkOrder(
                                order.id,
                                'price',
                                tempValue ? parseFloat(tempValue) : null,
                              )
                            }
                            onKeyDown={(e) => handleKeyDown(e, order.id, 'price')}
                            className="h-8 w-28"
                            autoFocus
                            disabled={updating}
                            placeholder="Pris"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : order.price ? (
                          <span className="text-green-600 dark:text-green-400 font-medium hover:underline cursor-pointer">
                            {Number(order.price).toLocaleString('sv-SE')} kr
                          </span>
                        ) : (
                          <span className="text-muted-foreground hover:underline cursor-pointer">
                            –
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-muted-foreground">
                        {order.due_date
                          ? format(new Date(order.due_date), 'yyyy-MM-dd', { locale: sv })
                          : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderOrdersCards = (orders: WorkOrderRow[], title: string, icon: string) => {
    const list = applyFilters(orders);
    const total = sectionTotal(orders);

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-medium flex items-center gap-2">
            <span>{icon}</span>
            {title}
          </h2>
          <div className="text-sm text-muted-foreground">
            {list.length} ordrar
            {total > 0 && ` • ${total.toLocaleString('sv-SE')} kr`}
          </div>
        </div>
        {list.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            Inga arbetsordrar
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {list.map((order) => (
              <Card
                key={order.id}
                className={`border-l-4 ${getPriorityBorderColor(order.priority)} cursor-pointer hover:border-primary/40 transition-colors`}
                onClick={() => openDetail(order)}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium leading-tight">{order.action}</p>
                      {order.components?.name && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {order.components.name}
                        </p>
                      )}
                    </div>
                    {workOrderPriorityBadge(order.priority)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="h-4 w-4 shrink-0" />
                    <span className="truncate">{order.properties?.name ?? '—'}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{workOrderStatusLabel(order.status)}</Badge>
                    {order.contractor && (
                      <span className="text-xs text-muted-foreground">{order.contractor}</span>
                    )}
                    {order.price ? (
                      <span className="text-sm font-medium text-green-600 dark:text-green-400">
                        {Number(order.price).toLocaleString('sv-SE')} kr
                      </span>
                    ) : null}
                    {order.due_date && (
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(order.due_date), 'yyyy-MM-dd', { locale: sv })}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderSections = () => {
    const render = viewMode === 'cards' ? renderOrdersCards : renderOrdersTable;
    if (showArchived) {
      return (
        <>
          {render(completed, 'Slutförda', '✅')}
          {render(archived, 'Arkiverade', '📦')}
        </>
      );
    }
    return (
      <>
        {render(notStarted, 'Ej påbörjad', '⏱')}
        {render(awaitingQuote, 'Inväntar offert', '⚠️')}
        {render(ordered, 'Beställt', '✅')}
      </>
    );
  };

  const hasActiveFilters = activeFilterCount > 0 || params.q.trim().length > 0;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 w-full">
          <header className="sticky top-0 z-10 flex h-14 md:h-16 items-center gap-2 md:gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
            <SidebarTrigger className="hidden md:flex" />
            <EntityListHeader
              icon={<Wrench className="h-5 w-5 text-primary shrink-0" />}
              title="Arbetsordrar"
              actions={
                <>
                  <Button
                    variant="outline"
                    size={isMobile ? 'sm' : 'default'}
                    onClick={() => setParam('archived', showArchived ? '0' : '1')}
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    {showArchived ? 'Aktiva' : 'Arkiverade'}
                  </Button>
                  <Button
                    variant="outline"
                    size={isMobile ? 'sm' : 'default'}
                    onClick={() => void handleExportExcel()}
                    disabled={exporting}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {exporting ? 'Exporterar...' : isMobile ? 'Export' : 'Exportera XLSX'}
                  </Button>
                  <Button
                    size={isMobile ? 'sm' : 'default'}
                    onClick={() => {
                      setEditingOrder(null);
                      setDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {isMobile ? 'Ny' : 'Ny arbetsorder'}
                  </Button>
                </>
              }
            />
          </header>

          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
            <div className="max-w-7xl mx-auto space-y-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Sök arbetsordrar..."
                      className="pl-10"
                      value={params.q}
                      onChange={(e) => setParam('q', e.target.value)}
                    />
                  </div>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="default" className="h-10">
                        <Filter className="h-4 w-4 mr-2" />
                        Filter
                        {activeFilterCount > 0 && (
                          <Badge
                            variant="secondary"
                            className="ml-2 h-5 min-w-5 px-1.5 flex items-center justify-center text-xs"
                          >
                            {activeFilterCount}
                          </Badge>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-4" align="start">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">Filter</h4>
                          {activeFilterCount > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={clearAllFilters}
                              className="h-8 text-muted-foreground"
                            >
                              Rensa alla
                            </Button>
                          )}
                        </div>

                        <div className="space-y-3">
                          <div>
                            <label className="text-sm text-muted-foreground mb-1.5 block">
                              Fastighet
                            </label>
                            <Select
                              value={params.property}
                              onValueChange={(v) => setParam('property', v)}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Alla fastigheter" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Alla fastigheter</SelectItem>
                                {sortedProperties.map((property) => (
                                  <SelectItem key={property.id} value={property.id}>
                                    {property.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <label className="text-sm text-muted-foreground mb-1.5 block">
                              Entreprenör
                            </label>
                            <Select
                              value={params.contractor}
                              onValueChange={(v) => setParam('contractor', v)}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Alla entreprenörer" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Alla entreprenörer</SelectItem>
                                {contractors.map((contractor) => (
                                  <SelectItem key={contractor} value={contractor}>
                                    {contractor}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <label className="text-sm text-muted-foreground mb-1.5 block">
                              Status
                            </label>
                            <Select
                              value={params.status}
                              onValueChange={(v) => setParam('status', v)}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Alla statusar" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Alla statusar</SelectItem>
                                <SelectItem value="not_started">Ej påbörjad</SelectItem>
                                <SelectItem value="awaiting_quote">Inväntar offert</SelectItem>
                                <SelectItem value="ordered">Beställt</SelectItem>
                                <SelectItem value="completed">Slutförd</SelectItem>
                                <SelectItem value="archived">Arkiverad</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {!isMobile && (
                  <div className="flex gap-1 border border-border rounded-lg p-1 self-start">
                    <Button
                      variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('kanban')}
                      className="h-8"
                    >
                      <LayoutGrid className="h-4 w-4 mr-2" />
                      Kanban
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
                    <Button
                      variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setViewMode('cards')}
                      className="h-8"
                    >
                      <CreditCard className="h-4 w-4 mr-2" />
                      Kort
                    </Button>
                  </div>
                )}
              </div>

              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {showArchived
                    ? `${filteredAll.length} arkiverade / slutförda`
                    : `${activeCount} aktiva arbetsordrar`}
                </span>
                {hasActiveFilters && !showArchived && (
                  <span>{` • ${filteredAll.length} visas`}</span>
                )}
              </div>

              {isLoading ? (
                <EntityListSkeleton />
              ) : isError ? (
                <EntityListError onRetry={() => void refetchQuery()} />
              ) : allOrders.length === 0 ? (
                <EntityListEmpty
                  title={showArchived ? 'Inga arkiverade arbetsordrar' : 'Inga arbetsordrar än'}
                  description={
                    showArchived
                      ? 'Slutförda och arkiverade ordrar visas här.'
                      : 'Skapa den första så du kan följa åtgärder per fastighet.'
                  }
                  action={
                    showArchived ? undefined : (
                      <Button
                        onClick={() => {
                          setEditingOrder(null);
                          setDialogOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Ny arbetsorder
                      </Button>
                    )
                  }
                />
              ) : filteredAll.length === 0 ? (
                <EntityListEmpty
                  title="Inget matchar"
                  description="Prova ett annat sökord eller filter."
                  action={
                    <Button variant="outline" onClick={clearAllFilters}>
                      Rensa filter
                    </Button>
                  }
                />
              ) : viewMode === 'kanban' ? (
                <WorkOrderKanban
                  workOrders={
                    applyFilters(allOrders) as unknown as Parameters<
                      typeof WorkOrderKanban
                    >[0]['workOrders']
                  }
                  onEdit={(order) => {
                    setEditingOrder(order as unknown as WorkOrderRow);
                    setDialogOpen(true);
                  }}
                  onDelete={handleDelete}
                  onViewDetails={(order) => {
                    setDetailOrder(order as unknown as WorkOrderRow);
                    setDetailDialogOpen(true);
                  }}
                  onRefetch={refetch}
                />
              ) : (
                <div className="space-y-4">{renderSections()}</div>
              )}
            </div>
          </main>
        </SidebarInset>
      </div>

      <WorkOrderDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingOrder(null);
        }}
        order={editingOrder}
        propertyId={prefillPropertyId}
        onSuccess={() => {
          refetch();
          setDialogOpen(false);
          setEditingOrder(null);
        }}
      />

      <WorkOrderDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        workOrder={detailOrder}
        onUpdate={refetch}
      />
    </SidebarProvider>
  );
};

export default WorkOrders;
