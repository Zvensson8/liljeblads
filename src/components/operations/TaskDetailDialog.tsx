import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Task {
  id: string;
  name: string;
  description: string | null;
  planned_count: number;
  reported_count: number;
  quarter: Database["public"]["Enums"]["quarter_type"];
  year: number;
}

interface TaskComponent {
  id: string;
  component_id: string;
  is_reported: boolean;
  component: {
    name: string;
    type: string;
  };
}

interface TaskDetailDialogProps {
  taskId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetailDialog({
  taskId,
  open,
  onOpenChange,
}: TaskDetailDialogProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [components, setComponents] = useState<TaskComponent[]>([]);
  const [loading, setLoading] = useState(false);
  const [manualCount, setManualCount] = useState(0);

  useEffect(() => {
    if (open && taskId) {
      fetchTaskDetails();
    }
  }, [open, taskId]);

  const fetchTaskDetails = async () => {
    setLoading(true);

    const { data: taskData, error: taskError } = await supabase
      .from("drift_tasks")
      .select("*")
      .eq("id", taskId)
      .single();

    if (taskError) {
      toast.error("Kunde inte hämta uppgift");
      setLoading(false);
      return;
    }

    setTask(taskData);
    setManualCount(taskData.reported_count);

    const { data: componentData, error: componentError } = await supabase
      .from("drift_task_components")
      .select(`
        id,
        component_id,
        is_reported,
        component:components (
          name,
          type
        )
      `)
      .eq("task_id", taskId);

    if (componentError) {
      console.error("Error fetching components:", componentError);
    } else {
      setComponents(componentData || []);
    }

    setLoading(false);
  };

  const handleComponentToggle = async (componentId: string, isReported: boolean) => {
    const { error } = await supabase
      .from("drift_task_components")
      .update({ is_reported: isReported })
      .eq("id", componentId);

    if (error) {
      toast.error("Kunde inte uppdatera komponent");
      return;
    }

    // Update reported count based on checked components
    const newComponents = components.map((c) =>
      c.id === componentId ? { ...c, is_reported: isReported } : c
    );
    const reportedCount = newComponents.filter((c) => c.is_reported).length;

    const { error: updateError } = await supabase
      .from("drift_tasks")
      .update({ reported_count: reportedCount })
      .eq("id", taskId);

    if (updateError) {
      toast.error("Kunde inte uppdatera antal");
      return;
    }

    fetchTaskDetails();
    toast.success("Uppdaterat");
  };

  const handleManualCountUpdate = async () => {
    const { error } = await supabase
      .from("drift_tasks")
      .update({ reported_count: manualCount })
      .eq("id", taskId);

    if (error) {
      toast.error("Kunde inte uppdatera antal");
      return;
    }

    toast.success("Antal uppdaterat");
    fetchTaskDetails();
  };

  const getStatus = () => {
    if (!task) return "missing";
    if (task.reported_count === 0) return "missing";
    if (task.reported_count >= task.planned_count) return "completed";
    return "remaining";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500">Klar</Badge>;
      case "remaining":
        return <Badge className="bg-yellow-500">Kvar</Badge>;
      case "missing":
        return <Badge className="bg-red-500">Saknas</Badge>;
      default:
        return null;
    }
  };

  if (loading || !task) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {task.name}
            {getStatusBadge(getStatus())}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">År:</span> {task.year}
            </div>
            <div>
              <span className="font-medium">Kvartal:</span> {task.quarter}
            </div>
            <div>
              <span className="font-medium">Planerade:</span> {task.planned_count}
            </div>
            <div>
              <span className="font-medium">Redovisade:</span> {task.reported_count}
            </div>
          </div>

          {task.description && (
            <div>
              <Label>Beskrivning</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {task.description}
              </p>
            </div>
          )}

          {components.length > 0 ? (
            <div className="space-y-3">
              <Label>Kopplade komponenter ({components.length})</Label>
              <div className="border rounded-lg divide-y">
                {components.map((comp) => (
                  <div
                    key={comp.id}
                    className="flex items-center gap-3 p-3 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={comp.is_reported}
                      onCheckedChange={(checked) =>
                        handleComponentToggle(comp.id, checked as boolean)
                      }
                    />
                    <div className="flex-1">
                      <p className="font-medium">{comp.component.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {comp.component.type}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Label>Manuell uppdatering av redovisade</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  value={manualCount}
                  onChange={(e) => setManualCount(parseInt(e.target.value) || 0)}
                />
                <Button onClick={handleManualCountUpdate}>Uppdatera</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
