import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Archive, LayoutGrid, Table as TableIcon, Wrench, Filter, Building2 } from "lucide-react";
import { WorkOrderDialog } from "@/components/WorkOrderDialog";
import { WorkOrderDetailDialog } from "@/components/WorkOrderDetailDialog";
import { WorkOrderKanban } from "@/components/WorkOrderKanban";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const WorkOrders = () => {
  const { session } = useAuth();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "table">("table");
  const [selectedProperty, setSelectedProperty] = useState<string>("all");
  const [selectedContractor, setSelectedContractor] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  
  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ orderId: string; field: string } | null>(null);
  const [tempValue, setTempValue] = useState<any>(null);
  const [updating, setUpdating] = useState(false);

  const { data: workOrders, refetch } = useQuery({
    queryKey: ["work-orders", showArchived],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_orders")
        .select(`
          *,
          properties (
            id,
            name
          ),
          components (
            id,
            name,
            type
          )
        `)
        .in("status", showArchived ? ["completed", "archived"] : ["not_started", "awaiting_quote", "ordered"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!session,
  });

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("work_orders")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Kunde inte ta bort arbetsorder");
    } else {
      toast.success("Arbetsorder borttagen");
      refetch();
    }
  };

  const activeCount = (workOrders?.filter((wo) => wo.status !== "archived") || []).length;
  
  // Group orders by status
  const notStarted = workOrders?.filter((wo) => wo.status === "not_started") || [];
  const awaitingQuote = workOrders?.filter((wo) => wo.status === "awaiting_quote") || [];
  const ordered = workOrders?.filter((wo) => wo.status === "ordered") || [];
  const orderedTotal = ordered.reduce((sum, wo) => sum + (Number(wo.price) || 0), 0);

  const filteredOrders = (orders: any[]) => {
    let filtered = orders;
    
    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(
        (wo) =>
          wo.action?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          wo.properties?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          wo.contractor?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    // Filter by property
    if (selectedProperty !== "all") {
      filtered = filtered.filter((wo) => wo.property_id === selectedProperty);
    }
    
    // Filter by contractor
    if (selectedContractor !== "all") {
      filtered = filtered.filter((wo) => wo.contractor === selectedContractor);
    }
    
    // Filter by status
    if (selectedStatus !== "all") {
      filtered = filtered.filter((wo) => wo.status === selectedStatus);
    }
    
    return filtered;
  };

  // Get unique values for filters
  const uniqueProperties = Array.from(
    new Set(workOrders?.map((wo) => wo.properties?.name).filter(Boolean))
  );
  const uniqueContractors = Array.from(
    new Set(workOrders?.map((wo) => wo.contractor).filter(Boolean))
  );
  
  const activeFilterCount = 
    (selectedProperty !== "all" ? 1 : 0) +
    (selectedContractor !== "all" ? 1 : 0) +
    (selectedStatus !== "all" ? 1 : 0);
  
  const clearAllFilters = () => {
    setSelectedProperty("all");
    setSelectedContractor("all");
    setSelectedStatus("all");
  };

  // Inline editing functions
  const updateWorkOrder = async (orderId: string, field: string, value: any) => {
    setUpdating(true);
    try {
      const updateData: any = { [field]: value, updated_at: new Date().toISOString() };
      
      const { error } = await supabase
        .from("work_orders")
        .update(updateData)
        .eq("id", orderId);
      
      if (error) throw error;
      
      toast.success("Arbetsorder uppdaterad");
      refetch();
    } catch (error) {
      toast.error("Kunde inte uppdatera arbetsorder");
    } finally {
      setUpdating(false);
      setEditingCell(null);
      setTempValue(null);
    }
  };

  const startEditing = (orderId: string, field: string, currentValue: any) => {
    setEditingCell({ orderId, field });
    setTempValue(currentValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent, orderId: string, field: string) => {
    if (e.key === "Enter" && tempValue !== null) {
      updateWorkOrder(orderId, field, field === "price" ? parseFloat(tempValue) || null : tempValue);
    } else if (e.key === "Escape") {
      setEditingCell(null);
      setTempValue(null);
    }
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      not_started: "Ej påbörjad",
      awaiting_quote: "Inväntar offert",
      ordered: "Beställt",
      completed: "Slutförd",
      archived: "Arkiverad",
    };
    return labels[status as keyof typeof labels] || status;
  };

  const getPriorityBorderColor = (priority: string) => {
    const colors = {
      high: "border-l-red-500",
      medium: "border-l-yellow-500",
      low: "border-l-green-500",
    };
    return colors[priority as keyof typeof colors] || "border-l-transparent";
  };

  const renderOrdersTable = (orders: any[], title: string, icon: string, total?: number) => {
    const tableOrders = filteredOrders(orders);
    
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
              {total !== undefined && total > 0 && ` • ${total.toLocaleString("sv-SE")} kr`}
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
                      onClick={() => {
                        setDetailOrder(order);
                        setDetailDialogOpen(true);
                      }}
                    >
                      <td className="py-3 px-3 font-medium">{order.action}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                          <span>{order.properties?.name}</span>
                        </div>
                      </td>
                      <td 
                        className="py-3 px-3"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(order.id, "status", order.status);
                        }}
                      >
                        {editingCell?.orderId === order.id && editingCell?.field === "status" ? (
                          <Select
                            value={tempValue}
                            onValueChange={(value) => {
                              setTempValue(value);
                              updateWorkOrder(order.id, "status", value);
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
                            {getStatusLabel(order.status)}
                          </Badge>
                        )}
                      </td>
                      <td 
                        className="py-3 px-3"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEditing(order.id, "price", order.price?.toString() || "");
                        }}
                      >
                        {editingCell?.orderId === order.id && editingCell?.field === "price" ? (
                          <Input
                            type="number"
                            value={tempValue}
                            onChange={(e) => setTempValue(e.target.value)}
                            onBlur={() => updateWorkOrder(order.id, "price", tempValue ? parseFloat(tempValue) : null)}
                            onKeyDown={(e) => handleKeyDown(e, order.id, "price")}
                            className="h-8 w-28"
                            autoFocus
                            disabled={updating}
                            placeholder="Pris"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : order.price ? (
                          <span className="text-green-600 dark:text-green-400 font-medium hover:underline cursor-pointer">
                            {Number(order.price).toLocaleString("sv-SE")} kr
                          </span>
                        ) : (
                          <span className="text-muted-foreground hover:underline cursor-pointer">–</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-muted-foreground">
                        {order.due_date
                          ? format(new Date(order.due_date), "yyyy-MM-dd", { locale: sv })
                          : "–"}
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

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 w-full">
          <header className="sticky top-0 z-10 flex h-14 md:h-16 items-center gap-2 md:gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
            <SidebarTrigger className="hidden md:flex" />
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              <h1 className="text-lg md:text-xl font-semibold">Arbetsordrar</h1>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Top bar with search and actions */}
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Sök arbetsordrar..."
                      className="pl-10"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  
                  {/* Filter Popover */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="default" className="h-10">
                        <Filter className="h-4 w-4 mr-2" />
                        Filter
                        {activeFilterCount > 0 && (
                          <Badge variant="secondary" className="ml-2 h-5 min-w-5 px-1.5 flex items-center justify-center text-xs">
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
                            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-8 text-muted-foreground">
                              Rensa alla
                            </Button>
                          )}
                        </div>
                        
                        <div className="space-y-3">
                          <div>
                            <label className="text-sm text-muted-foreground mb-1.5 block">Fastighet</label>
                            <Select value={selectedProperty} onValueChange={setSelectedProperty}>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Alla fastigheter" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Alla fastigheter</SelectItem>
                                {uniqueProperties.map((property) => (
                                  <SelectItem key={property} value={workOrders?.find(wo => wo.properties?.name === property)?.property_id || property}>
                                    {property}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div>
                            <label className="text-sm text-muted-foreground mb-1.5 block">Entreprenör</label>
                            <Select value={selectedContractor} onValueChange={setSelectedContractor}>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Alla entreprenörer" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">Alla entreprenörer</SelectItem>
                                {uniqueContractors.map((contractor) => (
                                  <SelectItem key={contractor} value={contractor}>
                                    {contractor}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          
                          <div>
                            <label className="text-sm text-muted-foreground mb-1.5 block">Status</label>
                            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
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

                <div className="flex gap-2">
                  {!isMobile && (
                    <div className="flex gap-1 border border-border rounded-lg p-1">
                      <Button
                        variant={viewMode === "kanban" ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setViewMode("kanban")}
                        className="h-8"
                      >
                        <LayoutGrid className="h-4 w-4 mr-2" />
                        Kanban
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
                  )}
                  <Button
                    variant="outline"
                    size={isMobile ? "sm" : "default"}
                    onClick={() => setShowArchived(!showArchived)}
                  >
                    <Archive className="h-4 w-4 mr-2" />
                    {showArchived ? "Aktiva" : "Arkiverade"}
                  </Button>
                  <Button
                    size={isMobile ? "sm" : "default"}
                    onClick={() => {
                      setEditingOrder(null);
                      setDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {isMobile ? "Ny" : "Ny Arbetsorder"}
                  </Button>
                </div>
              </div>

              {/* Active count summary */}
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{activeCount} aktiva arbetsordrar</span>
              </div>

              {/* Content based on view mode */}
              {viewMode === "kanban" ? (
                <WorkOrderKanban
                  workOrders={filteredOrders(workOrders || [])}
                  onEdit={(order) => {
                    setEditingOrder(order);
                    setDialogOpen(true);
                  }}
                  onDelete={handleDelete}
                  onViewDetails={(order) => {
                    setDetailOrder(order);
                    setDetailDialogOpen(true);
                  }}
                  onRefetch={refetch}
                />
              ) : (
                <div className="space-y-4">
                  {renderOrdersTable(notStarted, "Ej påbörjad", "⏱")}
                  {renderOrdersTable(awaitingQuote, "Inväntar offert", "⚠️")}
                  {renderOrdersTable(ordered, "Beställt", "✅", orderedTotal)}
                </div>
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
