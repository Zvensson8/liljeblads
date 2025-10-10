import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Wrench } from "lucide-react";

interface DriftTask {
  id: string;
  name: string;
  year: number;
  quarter: Database["public"]["Enums"]["quarter_type"];
}

interface ComponentServicePlanSectionProps {
  componentId: string;
  propertyId: string;
}

export function ComponentServicePlanSection({
  componentId,
  propertyId,
}: ComponentServicePlanSectionProps) {
  const [driftTasks, setDriftTasks] = useState<DriftTask[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (componentId && propertyId) {
      fetchDriftTasks();
      fetchExistingLinks();
    }
  }, [componentId, propertyId]);

  const fetchDriftTasks = async () => {
    const { data } = await supabase
      .from("drift_tasks")
      .select("id, name, year, quarter")
      .eq("property_id", propertyId)
      .gte("year", currentYear - 1)
      .order("year", { ascending: true })
      .order("quarter", { ascending: true });

    setDriftTasks(data || []);
  };

  const fetchExistingLinks = async () => {
    const { data } = await supabase
      .from("drift_task_components")
      .select("task_id")
      .eq("component_id", componentId);

    if (data) {
      setSelectedTaskIds(data.map((d) => d.task_id));
    }
  };

  const handleToggleTask = async (taskId: string, checked: boolean) => {
    setLoading(true);

    if (checked) {
      // Add link
      const { error } = await supabase.from("drift_task_components").insert({
        task_id: taskId,
        component_id: componentId,
        object_name: null,
        is_reported: false,
      });

      if (error) {
        toast.error("Kunde inte lägga till komponent");
        setLoading(false);
        return;
      }

      // Update planned count
      const task = driftTasks.find((t) => t.id === taskId);
      if (task) {
        const { data: existingObjects } = await supabase
          .from("drift_task_components")
          .select("id")
          .eq("task_id", taskId);

        await supabase
          .from("drift_tasks")
          .update({ planned_count: existingObjects?.length || 0 })
          .eq("id", taskId);
      }

      setSelectedTaskIds([...selectedTaskIds, taskId]);
      toast.success("Komponent tillagd i driftuppgift");
    } else {
      // Remove link
      const { error } = await supabase
        .from("drift_task_components")
        .delete()
        .eq("task_id", taskId)
        .eq("component_id", componentId);

      if (error) {
        toast.error("Kunde inte ta bort komponent");
        setLoading(false);
        return;
      }

      // Update planned count
      const task = driftTasks.find((t) => t.id === taskId);
      if (task) {
        const { data: remainingObjects } = await supabase
          .from("drift_task_components")
          .select("id")
          .eq("task_id", taskId);

        await supabase
          .from("drift_tasks")
          .update({ planned_count: remainingObjects?.length || 0 })
          .eq("id", taskId);
      }

      setSelectedTaskIds(selectedTaskIds.filter((id) => id !== taskId));
      toast.success("Komponent borttagen från driftuppgift");
    }

    setLoading(false);
  };

  const groupedTasks = driftTasks.reduce((acc, task) => {
    const key = `${task.year}-${task.quarter}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(task);
    return acc;
  }, {} as Record<string, DriftTask[]>);

  return (
    <Card>
      <CardHeader className="bg-muted/30">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wrench className="h-5 w-5 text-primary" />
          Koppla till Driftuppgifter
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Välj vilka driftuppgifter denna komponent ska ingå i
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {Object.keys(groupedTasks).length === 0 ? (
          <div className="text-center py-6 border-2 border-dashed rounded-lg">
            <p className="text-sm text-muted-foreground mb-2">
              Inga driftuppgifter finns för denna fastighet ännu
            </p>
            <p className="text-xs text-muted-foreground">
              Skapa driftuppgifter i Driftuppföljning-modulen först
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(groupedTasks).map(([key, tasks]) => {
              const [year, quarter] = key.split("-");
              return (
                <div key={key} className="border rounded-lg p-3 bg-card">
                  <h4 className="text-sm font-semibold mb-3 text-primary">
                    {year} - {quarter}
                  </h4>
                  <div className="space-y-2 pl-2">
                    {tasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-3 hover:bg-muted/50 p-2 rounded transition-colors">
                        <Checkbox
                          id={`task-${task.id}`}
                          checked={selectedTaskIds.includes(task.id)}
                          onCheckedChange={(checked) =>
                            handleToggleTask(task.id, checked as boolean)
                          }
                          disabled={loading}
                        />
                        <Label htmlFor={`task-${task.id}`} className="cursor-pointer text-sm flex-1">
                          {task.name}
                        </Label>
                        {selectedTaskIds.includes(task.id) && (
                          <span className="text-xs text-green-600 font-medium">✓ Inkluderad</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {selectedTaskIds.length > 0 && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mt-4">
                <p className="text-sm text-primary font-medium">
                  ✓ Komponenten ingår i {selectedTaskIds.length} driftuppgift{selectedTaskIds.length !== 1 ? 'er' : ''}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
