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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Archive, Edit2, Trash2, LayoutGrid, Table as TableIcon, Wrench } from "lucide-react";
import { WorkOrderDialog } from "@/components/WorkOrderDialog";
import { WorkOrderDetailDialog } from "@/components/WorkOrderDetailDialog";
import { WorkOrderKanban } from "@/components/WorkOrderKanban";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const WorkOrders = () => {
  const { session } = useAuth();
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");

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

  const notStarted = workOrders?.filter((wo) => wo.status === "not_started") || [];
  const awaitingQuote = workOrders?.filter((wo) => wo.status === "awaiting_quote") || [];
  const ordered = workOrders?.filter((wo) => wo.status === "ordered") || [];
  
  const orderedTotal = ordered.reduce((sum, wo) => sum + (Number(wo.price) || 0), 0);
  const activeCount = (workOrders?.filter((wo) => wo.status !== "archived") || []).length;

  const filteredOrders = (orders: any[]) => {
    if (!searchQuery) return orders;
    return orders.filter(
      (wo) =>
        wo.action?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        wo.properties?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        wo.contractor?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const getPriorityBadge = (priority: string) => {
    const colors = {
      low: "bg-green-500/10 text-green-500 border-green-500/20",
      medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      high: "bg-red-500/10 text-red-500 border-red-500/20",
    };
    const labels = { low: "Låg", medium: "Medel", high: "Hög" };
    return (
      <Badge className={colors[priority as keyof typeof colors]}>
        {labels[priority as keyof typeof labels]}
      </Badge>
    );
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

  const renderOrdersTable = (orders: any[], title: string, count: number, total?: number) => (
    <Card className="border-border">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-medium flex items-center gap-2">
          {title === "Ej påbörjad" && <span className="text-muted-foreground">⏱</span>}
          {title === "Inväntar offert" && <span className="text-yellow-500">⚠</span>}
          {title === "Beställt" && <span className="text-blue-500">🌐</span>}
          {title}
        </CardTitle>
        <div className="text-sm text-muted-foreground">
          {count} ordrar {total !== undefined && `${total.toLocaleString("sv-SE")} kr`}
        </div>
      </CardHeader>
      <CardContent>
        {filteredOrders(orders).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            Inga arbetsordrar
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-sm text-muted-foreground">
                  <th className="text-left py-3 px-2 font-medium">Fastighet</th>
                  <th className="text-left py-3 px-2 font-medium">Åtgärd</th>
                  <th className="text-left py-3 px-2 font-medium">Entreprenör</th>
                  <th className="text-left py-3 px-2 font-medium">Pris</th>
                  <th className="text-left py-3 px-2 font-medium">Datum</th>
                  <th className="text-left py-3 px-2 font-medium">Prioritet</th>
                  <th className="text-left py-3 px-2 font-medium">Kvartal</th>
                  <th className="text-left py-3 px-2 font-medium">Status</th>
                  <th className="text-left py-3 px-2 font-medium">Åtgärder</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders(orders).map((order) => (
                  <tr 
                    key={order.id} 
                    className="border-b hover:bg-muted/50 cursor-pointer"
                    onClick={() => {
                      setDetailOrder(order);
                      setDetailDialogOpen(true);
                    }}
                  >
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">🏢</span>
                        <span className="font-medium">{order.properties?.name}</span>
                      </div>
                    </td>
                    <td className="py-3 px-2">{order.action}</td>
                    <td className="py-3 px-2">
                      {order.contractor ? (
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground">👤</span>
                          {order.contractor}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {order.price ? (
                        <span className="text-green-500 font-medium">
                          💰 {Number(order.price).toLocaleString("sv-SE")} kr
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {order.due_date
                        ? format(new Date(order.due_date), "yyyy-MM-dd", { locale: sv })
                        : "-"}
                    </td>
                    <td className="py-3 px-2">{getPriorityBadge(order.priority)}</td>
                    <td className="py-3 px-2">{order.quarter || "-"}</td>
                    <td className="py-3 px-2">
                      <Badge variant="outline">{getStatusLabel(order.status)}</Badge>
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingOrder(order);
                            setDialogOpen(true);
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(order.id);
                          }}
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
        )}
      </CardContent>
    </Card>
  );

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1">
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Arbetsordrar</h1>
            </div>
          </header>

          <main className="flex-1 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{activeCount} aktiva arbetsordrar</span>
                </div>
                <div className="relative w-96">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Sök fastigheter, komponenter, arbetsordrar"
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
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

              {/* Mobile: Tabs view, Desktop: Kanban or Table */}
              {isMobile && viewMode === "kanban" ? (
                <Tabs defaultValue="not_started" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="not_started" className="text-xs">
                      Ej påbörjad
                      <Badge variant="outline" className="ml-1">{filteredOrders(notStarted).length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="awaiting_quote" className="text-xs">
                      Inväntar
                      <Badge variant="outline" className="ml-1">{filteredOrders(awaitingQuote).length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="ordered" className="text-xs">
                      Beställt
                      <Badge variant="outline" className="ml-1">{filteredOrders(ordered).length}</Badge>
                    </TabsTrigger>
                  </TabsList>
                  
                  {['not_started', 'awaiting_quote', 'ordered'].map(status => {
                    const statusOrders = status === 'not_started' ? notStarted : 
                                       status === 'awaiting_quote' ? awaitingQuote : ordered;
                    return (
                      <TabsContent key={status} value={status} className="space-y-3">
                        {filteredOrders(statusOrders).length === 0 ? (
                          <Card>
                            <CardContent className="p-8 text-center">
                              <p className="text-muted-foreground">Inga arbetsordrar</p>
                            </CardContent>
                          </Card>
                        ) : (
                          filteredOrders(statusOrders).map(order => (
                            <Card 
                              key={order.id} 
                              className="cursor-pointer hover:shadow-md transition-shadow"
                              onClick={() => {
                                setDetailOrder(order);
                                setDetailDialogOpen(true);
                              }}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-2 mb-3">
                                  <div className="flex-1">
                                    <h4 className="font-medium text-sm leading-tight mb-1">
                                      {order.action}
                                    </h4>
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                      <span>🏢</span>
                                      <span>{order.properties?.name}</span>
                                    </div>
                                  </div>
                                  {getPriorityBadge(order.priority)}
                                </div>
                                
                                {order.contractor && (
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
                                    <span>👤</span>
                                    <span>{order.contractor}</span>
                                  </div>
                                )}
                                
                                {order.due_date && (
                                  <div className="text-xs text-muted-foreground mb-2">
                                    📅 {format(new Date(order.due_date), "yyyy-MM-dd", { locale: sv })}
                                  </div>
                                )}
                                
                                {order.price && (
                                  <div className="text-sm font-medium text-green-500 mb-3">
                                    💰 {Number(order.price).toLocaleString("sv-SE")} kr
                                  </div>
                                )}
                                
                                <div className="flex gap-2 pt-3 border-t">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingOrder(order);
                                      setDialogOpen(true);
                                    }}
                                  >
                                    <Edit2 className="h-3 w-3 mr-1" />
                                    Redigera
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(order.id);
                                    }}
                                  >
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Ta bort
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ))
                        )}
                      </TabsContent>
                    );
                  })}
                </Tabs>
              ) : viewMode === "kanban" ? (
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
                {renderOrdersTable(notStarted, "Ej påbörjad", notStarted.length)}
                {renderOrdersTable(awaitingQuote, "Inväntar offert", awaitingQuote.length)}
                {renderOrdersTable(ordered, "Beställt", ordered.length, orderedTotal)}
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
