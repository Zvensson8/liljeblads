import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { CheckCircle2, Circle, Calendar } from "lucide-react";

interface ChecklistItem {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  deadline: string | null;
  responsible: string | null;
  order_index: number;
}

interface ProjectChecklistManagementProps {
  projectId: string;
}

export function ProjectChecklistManagement({
  projectId,
}: ProjectChecklistManagementProps) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchChecklistItems();
  }, [projectId]);

  const fetchChecklistItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("project_checklist_items")
        .select("*")
        .eq("project_id", projectId)
        .order("order_index", { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (error: any) {
      toast.error("Kunde inte hämta checklista");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleComplete = async (item: ChecklistItem) => {
    try {
      const { error } = await supabase
        .from("project_checklist_items")
        .update({
          completed: !item.completed,
          completed_at: !item.completed ? new Date().toISOString() : null,
        })
        .eq("id", item.id);

      if (error) throw error;

      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, completed: !i.completed } : i
        )
      );

      toast.success(
        !item.completed ? "Markerad som klar" : "Markerad som ej klar"
      );
    } catch (error: any) {
      toast.error("Kunde inte uppdatera checklista");
    }
  };

  const completedCount = items.filter((i) => i.completed).length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const isOverdue = (deadline: string | null, completed: boolean) => {
    if (!deadline || completed) return false;
    return new Date(deadline) < new Date();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Framsteg</h3>
          <span className="text-sm text-muted-foreground">
            {completedCount} av {totalCount} klara
          </span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Checklist Items */}
      {items.length === 0 ? (
        <div className="text-center py-12">
          <Circle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-lg mb-2 text-muted-foreground">Ingen checklista</p>
          <p className="text-sm text-muted-foreground">
            Inga checklistpunkter har lagts till för detta projekt
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-start gap-4 p-4 border rounded-lg transition-colors ${
                item.completed ? "bg-muted/50" : "bg-background"
              } ${
                isOverdue(item.deadline, item.completed)
                  ? "border-red-300 bg-red-50/50"
                  : ""
              }`}
            >
              <Button
                variant="ghost"
                size="sm"
                className="p-0 h-auto hover:bg-transparent"
                onClick={() => handleToggleComplete(item)}
              >
                {item.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
              </Button>

              <div className="flex-1 space-y-1">
                <div className="flex items-start justify-between gap-4">
                  <h4
                    className={`font-medium ${
                      item.completed
                        ? "line-through text-muted-foreground"
                        : ""
                    }`}
                  >
                    {item.title}
                  </h4>
                  {isOverdue(item.deadline, item.completed) && (
                    <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-1 rounded whitespace-nowrap">
                      Försenad
                    </span>
                  )}
                </div>

                {item.description && (
                  <p className="text-sm text-muted-foreground">
                    {item.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {item.responsible && (
                    <span className="flex items-center gap-1">
                      <span className="font-medium">Ansvarig:</span>{" "}
                      {item.responsible}
                    </span>
                  )}
                  {item.deadline && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(item.deadline), "PPP", { locale: sv })}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
