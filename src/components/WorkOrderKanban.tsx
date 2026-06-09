import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit2, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { toast } from 'sonner';
import { useUpdateWorkOrder, type WorkOrderStatus } from '@/hooks/useWorkOrders';

interface WorkOrder {
  id: string;
  action: string;
  status: string;
  priority: string;
  price: number | null;
  due_date: string | null;
  contractor: string | null;
  quarter: string | null;
  properties: { id: string; name: string };
}

interface WorkOrderKanbanProps {
  workOrders: WorkOrder[];
  onEdit: (order: WorkOrder) => void;
  onDelete: (id: string) => void;
  onViewDetails: (order: WorkOrder) => void;
  onRefetch: () => void;
}

const columns = [
  { id: 'not_started', title: 'Ej påbörjad', icon: '⏱', color: 'text-muted-foreground' },
  { id: 'awaiting_quote', title: 'Inväntar offert', icon: '⚠', color: 'text-yellow-500' },
  { id: 'ordered', title: 'Beställt', icon: '🌐', color: 'text-blue-500' },
];

export const WorkOrderKanban = ({
  workOrders,
  onEdit,
  onDelete,
  onViewDetails,
  onRefetch,
}: WorkOrderKanbanProps) => {
  const [draggedOrder, setDraggedOrder] = useState<WorkOrder | null>(null);
  const updateWorkOrder = useUpdateWorkOrder();

  const getPriorityBadge = (priority: string) => {
    const colors = {
      low: 'bg-green-500/10 text-green-500 border-green-500/20',
      medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
      high: 'bg-red-500/10 text-red-500 border-red-500/20',
    };
    const labels = { low: 'Låg', medium: 'Medel', high: 'Hög' };
    return (
      <Badge className={colors[priority as keyof typeof colors]}>
        {labels[priority as keyof typeof labels]}
      </Badge>
    );
  };

  const handleDragStart = (order: WorkOrder) => setDraggedOrder(order);
  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = async (newStatus: string) => {
    if (!draggedOrder || draggedOrder.status === newStatus) {
      setDraggedOrder(null);
      return;
    }
    try {
      await updateWorkOrder.mutateAsync({
        id: draggedOrder.id,
        patch: { status: newStatus as WorkOrderStatus },
      });
      toast.success('Status uppdaterad');
      onRefetch();
    } catch {
      // hook toasts on error
    }
    setDraggedOrder(null);
  };

  const getOrdersForColumn = (columnId: string) =>
    workOrders.filter((wo) => wo.status === columnId);
  const calculateTotal = (orders: WorkOrder[]) =>
    orders.reduce((sum, wo) => sum + (Number(wo.price) || 0), 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {columns.map((column) => {
        const orders = getOrdersForColumn(column.id);
        const total = calculateTotal(orders);
        return (
          <div
            key={column.id}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(column.id)}
            className="animate-slide-in-up"
          >
            <Card className="border-border h-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-medium flex items-center gap-2">
                    <span className={column.color}>{column.icon}</span>
                    {column.title}
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {orders.length}
                  </Badge>
                </div>
                {total > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {total.toLocaleString('sv-SE')} kr
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {orders.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                    <p className="text-sm">Inga arbetsordrar</p>
                  </div>
                ) : (
                  orders.map((order) => (
                    <Card
                      key={order.id}
                      draggable
                      onDragStart={() => handleDragStart(order)}
                      onClick={() => onViewDetails(order)}
                      className="cursor-move hover:shadow-[var(--shadow-elegant)] transition-all hover:-translate-y-1 animate-scale-in"
                    >
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1 flex-1">
                            <h4 className="font-medium text-sm leading-tight">{order.action}</h4>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span>🏢</span>
                              <span>{order.properties?.name}</span>
                            </div>
                          </div>
                          {getPriorityBadge(order.priority)}
                        </div>

                        {order.contractor && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <span>👤</span>
                            <span>{order.contractor}</span>
                          </div>
                        )}

                        {order.due_date && (
                          <div className="text-xs text-muted-foreground">
                            📅 {format(new Date(order.due_date), 'yyyy-MM-dd', { locale: sv })}
                          </div>
                        )}

                        {order.price && (
                          <div className="text-sm font-medium text-green-500">
                            💰 {Number(order.price).toLocaleString('sv-SE')} kr
                          </div>
                        )}

                        <div className="flex gap-1 pt-2 border-t">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit(order);
                            }}
                          >
                            <Edit2 className="h-3 w-3 mr-1" />
                            Redigera
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(order.id);
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
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
};
