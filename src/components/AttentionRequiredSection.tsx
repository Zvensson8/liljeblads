import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface AttentionItem {
  id: string;
  type: "work_order" | "todo" | "component";
  title: string;
  subtitle: string;
  severity: "high" | "medium";
  path: string;
}

interface AttentionRequiredSectionProps {
  propertyId?: string;
}

export function AttentionRequiredSection({ propertyId }: AttentionRequiredSectionProps) {
  const navigate = useNavigate();
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAttentionItems();
  }, [propertyId]);

  const fetchAttentionItems = async () => {
    setLoading(true);
    const attentionItems: AttentionItem[] = [];

    try {
      // Fetch high priority work orders
      let workOrderQuery = supabase
        .from("work_orders")
        .select("id, action, priority, due_date, properties(name)")
        .eq("priority", "high")
        .neq("status", "completed")
        .neq("status", "archived");

      if (propertyId) {
        workOrderQuery = workOrderQuery.eq("property_id", propertyId);
      }

      const { data: workOrders } = await workOrderQuery.limit(5);

      if (workOrders) {
        attentionItems.push(
          ...workOrders.map((wo: any) => ({
            id: wo.id,
            type: "work_order" as const,
            title: wo.action,
            subtitle: `${wo.properties?.name || ""} - Brådskande`,
            severity: "high" as const,
            path: `/work-orders?id=${wo.id}`,
          }))
        );
      }

      // Fetch overdue todos
      let todoQuery = supabase
        .from("property_todos")
        .select("id, title, due_date, properties(name)")
        .eq("completed", false)
        .lt("due_date", new Date().toISOString());

      if (propertyId) {
        todoQuery = todoQuery.eq("property_id", propertyId);
      }

      const { data: todos } = await todoQuery.limit(5);

      if (todos) {
        attentionItems.push(
          ...todos.map((todo: any) => ({
            id: todo.id,
            type: "todo" as const,
            title: todo.title,
            subtitle: `${todo.properties?.name || ""} - Förfallen ${format(
              new Date(todo.due_date),
              "PPP",
              { locale: sv }
            )}`,
            severity: "medium" as const,
            path: `/properties/${propertyId || todo.property_id}?tab=todos`,
          }))
        );
      }

      // Sort by severity
      attentionItems.sort((a, b) => {
        if (a.severity === "high" && b.severity !== "high") return -1;
        if (a.severity !== "high" && b.severity === "high") return 1;
        return 0;
      });

      setItems(attentionItems.slice(0, 8));
    } catch (error) {
      console.error("Error fetching attention items:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null;
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <Card className="border-orange-500/20 bg-orange-500/5 hover:shadow-[var(--shadow-elegant)] transition-all">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          Kräver uppmärksamhet
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={`${item.type}-${item.id}`}
              className="flex items-start justify-between gap-4 p-3 rounded-lg bg-background hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => navigate(item.path)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {item.severity === "high" && (
                    <Badge variant="destructive" className="h-5 text-xs">
                      Brådskande
                    </Badge>
                  )}
                  {item.severity === "medium" && (
                    <Badge
                      variant="outline"
                      className="h-5 text-xs border-orange-500 text-orange-500"
                    >
                      Förfallen
                    </Badge>
                  )}
                </div>
                <p className="font-medium text-sm truncate">{item.title}</p>
                <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
              </div>
              <Button variant="ghost" size="icon" className="shrink-0">
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
