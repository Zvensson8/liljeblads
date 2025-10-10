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
    fetchDriftTasks();
    fetchExistingLinks();
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
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="h-5 w-5" />
          Serviceplan (Drift)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.keys(groupedTasks).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Inga driftuppgifter finns för denna fastighet ännu
          </p>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedTasks).map(([key, tasks]) => {
              const [year, quarter] = key.split("-");
              return (
                <div key={key} className="border rounded-lg p-3">
                  <h4 className="text-sm font-semibold mb-2">
                    {year} - {quarter}
                  </h4>
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <div key={task.id} className="flex items-center gap-2">
                        <Checkbox
                          id={task.id}
                          checked={selectedTaskIds.includes(task.id)}
                          onCheckedChange={(checked) =>
                            handleToggleTask(task.id, checked as boolean)
                          }
                          disabled={loading}
                        />
                        <Label htmlFor={task.id} className="cursor-pointer text-sm">
                          {task.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
