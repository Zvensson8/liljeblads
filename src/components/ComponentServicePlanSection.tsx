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
import { Wrench, ExternalLink, AlertCircle, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

interface DriftTask {
  id: string;
  name: string;
  year: number;
  quarter: Database["public"]["Enums"]["quarter_type"];
  planned_count: number;
  reported_count: number;
  objectCount?: number;
}

interface ComponentServicePlanSectionProps {
  componentId: string;
  propertyId: string;
}

export function ComponentServicePlanSection({
  componentId,
  propertyId,
}: ComponentServicePlanSectionProps) {
  const navigate = useNavigate();
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
      .select("id, name, year, quarter, planned_count, reported_count")
      .eq("property_id", propertyId)
      .gte("year", currentYear - 1)
      .order("year", { ascending: true })
      .order("quarter", { ascending: true });

    if (data) {
      // Fetch object count for each task
      const tasksWithCounts = await Promise.all(
        data.map(async (task) => {
          const { count } = await supabase
            .from("drift_task_components")
            .select("*", { count: "exact", head: true })
            .eq("task_id", task.id);
          
          return {
            ...task,
            objectCount: count || 0,
          };
        })
      );
      setDriftTasks(tasksWithCounts);
    }
  };

  const getTaskStatus = (task: DriftTask) => {
    if (task.reported_count === 0) return "missing";
    if (task.reported_count >= task.planned_count) return "completed";
    return "remaining";
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
      // Check if component is already added
      const { data: existing } = await supabase
        .from("drift_task_components")
        .select("id")
        .eq("task_id", taskId)
        .eq("component_id", componentId)
        .maybeSingle();

      if (existing) {
        toast.error("Komponenten finns redan i denna driftuppgift");
        setLoading(false);
        return;
      }

      // Fetch component data for series_id and registration_number
      const { data: component } = await supabase
        .from("components")
        .select("serial_number, registration_number")
        .eq("id", componentId)
        .single();

      // Add link
      const { error } = await supabase.from("drift_task_components").insert({
        task_id: taskId,
        component_id: componentId,
        object_name: null,
        is_reported: false,
        series_id: component?.serial_number || null,
        registration_number: component?.registration_number || null,
      });

      if (error) {
        toast.error("Kunde inte lägga till komponent");
        setLoading(false);
        return;
      }

      setSelectedTaskIds([...selectedTaskIds, taskId]);
      toast.success("Komponent tillagd i driftuppgift");
      fetchDriftTasks(); // Refresh to update counts
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

      setSelectedTaskIds(selectedTaskIds.filter((id) => id !== taskId));
      toast.success("Komponent borttagen från driftuppgift");
      fetchDriftTasks(); // Refresh to update counts
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
                    {tasks.map((task) => {
                      const status = getTaskStatus(task);
                      const isSelected = selectedTaskIds.includes(task.id);
                      
                      return (
                        <div key={task.id} className="border rounded-md p-3 hover:bg-muted/30 transition-colors">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={`task-${task.id}`}
                              checked={isSelected}
                              onCheckedChange={(checked) =>
                                handleToggleTask(task.id, checked as boolean)
                              }
                              disabled={loading}
                              className="mt-1"
                            />
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <Label htmlFor={`task-${task.id}`} className="cursor-pointer text-sm font-medium flex-1">
                                  {task.name}
                                </Label>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => navigate("/operations")}
                                  className="h-7 px-2"
                                  title="Öppna i Driftuppföljning"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              </div>
                              
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <span className="font-medium">{task.objectCount || 0}</span> objekt
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <span className="font-medium">{task.reported_count}/{task.planned_count}</span> redovisade
                                </span>
                                <span>•</span>
                                {status === "completed" && (
                                  <Badge variant="default" className="bg-green-600 h-5 px-1.5 text-xs">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />
                                    Klar
                                  </Badge>
                                )}
                                {status === "remaining" && (
                                  <Badge variant="default" className="bg-yellow-600 h-5 px-1.5 text-xs">
                                    Kvar
                                  </Badge>
                                )}
                                {status === "missing" && (
                                  <Badge variant="default" className="bg-red-600 h-5 px-1.5 text-xs">
                                    Saknas
                                  </Badge>
                                )}
                              </div>

                              {isSelected && (
                                <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium bg-green-50 rounded px-2 py-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Komponenten ingår i denna uppgift
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
