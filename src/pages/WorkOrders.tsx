import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Archive, Edit2, Trash2, LayoutGrid, Table as TableIcon } from "lucide-react";
import { WorkOrderDialog } from "@/components/WorkOrderDialog";
import { WorkOrderDetailDialog } from "@/components/WorkOrderDetailDialog";
import { WorkOrderKanban } from "@/components/WorkOrderKanban";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

const WorkOrders = () => {
  const { session } = useAuth();
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
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex-1">
          <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-3xl font-bold">Arbetsordrar</h1>
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

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{activeCount} aktiva arbetsordrar</span>
              </div>
              <div className="flex gap-2">
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
                <Button
                  variant="outline"
                  onClick={() => setShowArchived(!showArchived)}
                >
                  <Archive className="h-4 w-4 mr-2" />
                  {showArchived ? "Visa Aktiva" : "Visa Arkiverade"}
                </Button>
                <Button
                  onClick={() => {
                    setEditingOrder(null);
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Ny Arbetsorder
                </Button>
              </div>
            </div>

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
                {renderOrdersTable(notStarted, "Ej påbörjad", notStarted.length)}
                {renderOrdersTable(awaitingQuote, "Inväntar offert", awaitingQuote.length)}
                {renderOrdersTable(ordered, "Beställt", ordered.length, orderedTotal)}
              </div>
            )}
          </div>
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
