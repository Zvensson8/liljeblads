import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TaskObject {
  id: string;
  component_id: string;
  is_reported: boolean;
  component: {
    name: string;
    type: string;
  };
}

interface Component {
  id: string;
  name: string;
  type: string;
}

interface TaskObjectsDialogProps {
  taskId: string;
  propertyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskObjectsDialog({
  taskId,
  propertyId,
  open,
  onOpenChange,
}: TaskObjectsDialogProps) {
  const [objects, setObjects] = useState<TaskObject[]>([]);
  const [availableComponents, setAvailableComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedComponentId, setSelectedComponentId] = useState<string>("");

  useEffect(() => {
    if (open && taskId) {
      fetchTaskObjects();
      fetchAvailableComponents();
    }
  }, [open, taskId]);

  const fetchTaskObjects = async () => {
    setLoading(true);

    const { data, error } = await supabase
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

    if (error) {
      console.error("Error fetching objects:", error);
    } else {
      setObjects(data || []);
    }

    setLoading(false);
  };

  const fetchAvailableComponents = async () => {
    // Fetch all components from the property's floors
    const { data: floors } = await supabase
      .from("floors")
      .select("id")
      .eq("property_id", propertyId);

    if (!floors) return;

    const floorIds = floors.map((f) => f.id);

    const { data: components, error } = await supabase
      .from("components")
      .select("id, name, type")
      .in("floor_id", floorIds)
      .order("name");

    if (error) {
      console.error("Error fetching components:", error);
      return;
    }

    // Filter out components that are already added
    const existingComponentIds = objects.map((o) => o.component_id);
    const available = components.filter(
      (c) => !existingComponentIds.includes(c.id)
    );

    setAvailableComponents(available);
  };

  const handleToggleReported = async (objectId: string, isReported: boolean) => {
    const { error } = await supabase
      .from("drift_task_components")
      .update({ is_reported: isReported })
      .eq("id", objectId);

    if (error) {
      toast.error("Kunde inte uppdatera objekt");
      return;
    }

    // Update reported count
    const newObjects = objects.map((o) =>
      o.id === objectId ? { ...o, is_reported: isReported } : o
    );
    const reportedCount = newObjects.filter((o) => o.is_reported).length;

    const { error: updateError } = await supabase
      .from("drift_tasks")
      .update({ reported_count: reportedCount })
      .eq("id", taskId);

    if (updateError) {
      toast.error("Kunde inte uppdatera antal");
      return;
    }

    fetchTaskObjects();
    toast.success("Uppdaterat");
  };

  const handleAddComponent = async () => {
    if (!selectedComponentId) {
      toast.error("Välj en komponent");
      return;
    }

    const { error } = await supabase.from("drift_task_components").insert({
      task_id: taskId,
      component_id: selectedComponentId,
      is_reported: false,
    });

    if (error) {
      toast.error("Kunde inte lägga till objekt");
      return;
    }

    // Update planned count
    const { error: updateError } = await supabase
      .from("drift_tasks")
      .update({ planned_count: objects.length + 1 })
      .eq("id", taskId);

    if (updateError) {
      console.error("Error updating planned count:", updateError);
    }

    toast.success("Objekt tillagt");
    setSelectedComponentId("");
    fetchTaskObjects();
    fetchAvailableComponents();
  };

  const handleRemoveObject = async (objectId: string) => {
    if (!confirm("Är du säker på att du vill ta bort detta objekt?")) return;

    const { error } = await supabase
      .from("drift_task_components")
      .delete()
      .eq("id", objectId);

    if (error) {
      toast.error("Kunde inte ta bort objekt");
      return;
    }

    // Update planned count
    const { error: updateError } = await supabase
      .from("drift_tasks")
      .update({ planned_count: Math.max(0, objects.length - 1) })
      .eq("id", taskId);

    if (updateError) {
      console.error("Error updating planned count:", updateError);
    }

    toast.success("Objekt borttaget");
    fetchTaskObjects();
    fetchAvailableComponents();
  };

  if (loading) {
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
          <DialogTitle>Hantera objekt</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Existing objects */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Objekt ({objects.length})</h3>
            {objects.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Inga objekt skapade ännu
              </p>
            ) : (
              <div className="border rounded-lg divide-y">
                {objects.map((obj) => (
                  <div
                    key={obj.id}
                    className="flex items-center gap-3 p-3 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={obj.is_reported}
                      onCheckedChange={(checked) =>
                        handleToggleReported(obj.id, checked as boolean)
                      }
                    />
                    <div className="flex-1">
                      <p className="font-medium">{obj.component.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {obj.component.type}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveObject(obj.id)}
                    >
                      Ta bort
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add new object */}
          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-medium">Lägg till objekt</h3>
            <div className="flex gap-2">
              <Select
                value={selectedComponentId}
                onValueChange={setSelectedComponentId}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Välj komponent" />
                </SelectTrigger>
                <SelectContent>
                  {availableComponents.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      Inga komponenter tillgängliga
                    </div>
                  ) : (
                    availableComponents.map((comp) => (
                      <SelectItem key={comp.id} value={comp.id}>
                        {comp.name} ({comp.type})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAddComponent}
                disabled={!selectedComponentId}
              >
                <Plus className="h-4 w-4" />
                Lägg till
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
