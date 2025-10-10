import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronUp, MoreVertical, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { TaskDetailDialog } from "./TaskDetailDialog";

interface Task {
  id: string;
  name: string;
  description: string | null;
  planned_count: number;
  reported_count: number;
  category_id: string | null;
}

interface QuarterCardProps {
  quarter: Database["public"]["Enums"]["quarter_type"];
  propertyId: string;
  year: number;
  onAddTask: () => void;
}

export function QuarterCard({ quarter, propertyId, year, onAddTask }: QuarterCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [stats, setStats] = useState({ completed: 0, remaining: 0, missing: 0 });

  useEffect(() => {
    if (propertyId) {
      fetchTasks();
    }
  }, [propertyId, year, quarter]);

  const fetchTasks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("drift_tasks")
      .select("*")
      .eq("property_id", propertyId)
      .eq("year", year)
      .eq("quarter", quarter)
      .order("name");

    if (error) {
      toast.error("Kunde inte hämta uppgifter");
      setLoading(false);
      return;
    }

    setTasks(data || []);
    calculateStats(data || []);
    setLoading(false);
  };

  const calculateStats = (taskList: Task[]) => {
    const completed = taskList.filter(
      (t) => t.reported_count >= t.planned_count
    ).length;
    const remaining = taskList.filter(
      (t) => t.reported_count > 0 && t.reported_count < t.planned_count
    ).length;
    const missing = taskList.filter((t) => t.reported_count === 0).length;
    setStats({ completed, remaining, missing });
  };

  const getStatus = (task: Task) => {
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

  const handleDelete = async (taskId: string) => {
    const { error } = await supabase
      .from("drift_tasks")
      .delete()
      .eq("id", taskId);

    if (error) {
      toast.error("Kunde inte ta bort uppgift");
      return;
    }

    toast.success("Uppgift borttagen");
    fetchTasks();
  };

  const handleGenerateFromComponents = async () => {
    toast.info("Genererar uppgifter från komponenter...");
    // This will be implemented to look at component_service_plans
    // and create tasks automatically
  };

  return (
    <>
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <CardTitle>{quarter}</CardTitle>
              <div className="flex gap-2">
                <Badge variant="outline" className="bg-green-50">
                  Klara: {stats.completed}
                </Badge>
                <Badge variant="outline" className="bg-yellow-50">
                  Kvar: {stats.remaining}
                </Badge>
                <Badge variant="outline" className="bg-red-50">
                  Saknas: {stats.missing}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); fetchTasks(); }}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              {expanded ? <ChevronUp /> : <ChevronDown />}
            </div>
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={onAddTask} size="sm">
                <Plus className="h-4 w-4" />
                Lägg till uppgift
              </Button>
              <Button onClick={handleGenerateFromComponents} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4" />
                Generera från komponenter
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-8">Laddar uppgifter...</div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Inga uppgifter för detta kvartal
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Uppgift</TableHead>
                    <TableHead>Beskrivning</TableHead>
                    <TableHead>Planerade</TableHead>
                    <TableHead>Redovisade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow
                      key={task.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedTask(task.id)}
                    >
                      <TableCell className="font-medium">{task.name}</TableCell>
                      <TableCell>{task.description || "-"}</TableCell>
                      <TableCell>{task.planned_count}</TableCell>
                      <TableCell>{task.reported_count}</TableCell>
                      <TableCell>{getStatusBadge(getStatus(task))}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(task.id);
                              }}
                              className="text-destructive"
                            >
                              Ta bort
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        )}
      </Card>

      {selectedTask && (
        <TaskDetailDialog
          taskId={selectedTask}
          open={!!selectedTask}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedTask(null);
              fetchTasks();
            }
          }}
        />
      )}
    </>
  );
}
