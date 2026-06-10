import { useEffect, useMemo, useState } from "react";
import { Database } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Wrench, ExternalLink, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { useDriftTasks } from "@/hooks/useDriftTasks";
import { useComponents } from "@/hooks/useComponents";
import type { DriftTask as DriftTaskRow } from "@/types/domain/driftTask";
import type { ComponentWithRelations } from "@/types/domain/component";
import type { DriftTaskComponent } from "@/services/supabase/driftTaskComponentService";
import {
  useCreateDriftTaskComponent,
  useDeleteDriftTaskComponentByTaskAndComponent,
  useDriftTaskComponentsByTasks,
} from "@/hooks/useDriftTaskComponents";


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
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const currentYear = new Date().getFullYear();

  const { data: tasksRaw = [] } = useDriftTasks({ propertyId });
  const { data: components = [] } = useComponents({ propertyId });
  const component = useMemo(
    () => components.find((c) => c.id === componentId) as ComponentWithRelations | undefined,
    [components, componentId],
  );

  const taskIds = useMemo(() => (tasksRaw as DriftTaskRow[]).map((t) => t.id), [tasksRaw]);
  const { data: taskComponents = [] } = useDriftTaskComponentsByTasks(taskIds);
  const createLink = useCreateDriftTaskComponent();
  const deleteLink = useDeleteDriftTaskComponentByTaskAndComponent();

  useEffect(() => {
    setSelectedTaskIds(
      (taskComponents as DriftTaskComponent[])
        .filter((tc) => tc.component_id === componentId)
        .map((tc) => tc.task_id),
    );
  }, [taskComponents, componentId]);

  const driftTasks: DriftTask[] = useMemo(() => {
    const counts: Record<string, number> = {};
    (taskComponents as DriftTaskComponent[]).forEach((tc) => {
      counts[tc.task_id] = (counts[tc.task_id] || 0) + 1;
    });
    return (tasksRaw as DriftTaskRow[])
      .filter((t) => t.year >= currentYear - 1)
      .slice()
      .sort((a, b) => a.year - b.year || String(a.quarter).localeCompare(String(b.quarter)))
      .map((t) => ({
        id: t.id,
        name: t.name,
        year: t.year,
        quarter: t.quarter,
        planned_count: t.planned_count,
        reported_count: t.reported_count,
        objectCount: counts[t.id] || 0,
      }));
  }, [tasksRaw, taskComponents, currentYear]);


  const getTaskStatus = (task: DriftTask) => {
    if (task.reported_count === 0) return "missing";
    if (task.reported_count >= task.planned_count) return "completed";
    return "remaining";
  };

  const handleToggleTask = async (taskId: string, checked: boolean) => {
    setLoading(true);
    try {
      if (checked) {
        if (selectedTaskIds.includes(taskId)) {
          toast.error("Komponenten finns redan i denna driftuppgift");
          return;
        }
        await createLink.mutateAsync({
          task_id: taskId,
          component_id: componentId,
          object_name: null,
          is_reported: false,
          series_id: (component as { serial_number?: string | null } | undefined)?.serial_number || null,
          registration_number:
            (component as { registration_number?: string | null } | undefined)?.registration_number || null,

        });
        toast.success("Komponent tillagd i driftuppgift");
      } else {
        await deleteLink.mutateAsync({ taskId, componentId });
        toast.success("Komponent borttagen från driftuppgift");
      }
    } catch {
      // toast emitted from hook
    } finally {
      setLoading(false);
    }
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
