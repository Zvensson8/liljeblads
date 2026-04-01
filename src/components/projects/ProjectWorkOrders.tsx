import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { WorkOrderDialog } from "@/components/WorkOrderDialog";
import { WorkOrderDetailDialog } from "@/components/WorkOrderDetailDialog";

interface ProjectWorkOrdersProps {
  projectId: string;
  propertyId: string;
}

export function ProjectWorkOrders({ projectId, propertyId }: ProjectWorkOrdersProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const { data: workOrders, refetch } = useQuery({
    queryKey: ["project-work-orders", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_orders")
        .select("*, properties(name)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      not_started: "Ej påbörjad",
      awaiting_quote: "Inväntar offert",
      ordered: "Beställt",
      completed: "Slutförd",
      archived: "Arkiverad",
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      not_started: "bg-gray-500",
      awaiting_quote: "bg-yellow-500",
      ordered: "bg-blue-500",
      completed: "bg-green-500",
      archived: "bg-gray-400",
    };
    return colors[status] || "bg-gray-500";
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {workOrders?.length || 0} arbetsordrar kopplade till projektet
        </p>
        <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Ny arbetsorder
        </Button>
      </div>

      {workOrders && workOrders.length > 0 ? (
        <div className="space-y-2">
          {workOrders.map((wo) => (
            <div
              key={wo.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
              onClick={() => setSelectedOrder(wo)}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{wo.action}</p>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  {wo.contractor && <span>{wo.contractor}</span>}
                  {wo.due_date && (
                    <span>{format(new Date(wo.due_date), "yyyy-MM-dd", { locale: sv })}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {wo.price && (
                  <span className="text-sm font-medium">
                    {Number(wo.price).toLocaleString("sv-SE")} kr
                  </span>
                )}
                <Badge className={getStatusColor(wo.status)}>
                  {getStatusLabel(wo.status)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
          Inga arbetsordrar kopplade till projektet ännu
        </div>
      )}

      <WorkOrderDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        propertyId={propertyId}
        projectId={projectId}
        onSuccess={() => {
          refetch();
          setCreateDialogOpen(false);
        }}
      />

      <WorkOrderDetailDialog
        open={!!selectedOrder}
        onOpenChange={(open) => !open && setSelectedOrder(null)}
        workOrder={selectedOrder}
        onUpdate={refetch}
      />
    </div>
  );
}
