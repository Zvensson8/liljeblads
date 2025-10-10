import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronDown, ChevronUp, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TaskObjectsDialog } from "./TaskObjectsDialog";

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
}

export function QuarterCard({ quarter, propertyId, year }: QuarterCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ completed: 0, remaining: 0, missing: 0 });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  
  // Form state
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskPlanned, setNewTaskPlanned] = useState<number>(0);

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

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newTaskName.trim()) {
      toast.error("Uppgiftsnamn krävs");
      return;
    }

    const { error } = await supabase.from("drift_tasks").insert({
      property_id: propertyId,
      year,
      quarter,
      name: newTaskName.trim(),
      description: newTaskDescription.trim() || null,
      planned_count: newTaskPlanned,
      reported_count: 0,
    });

    if (error) {
      toast.error("Kunde inte skapa uppgift");
      return;
    }

    toast.success("Uppgift skapad");
    setNewTaskName("");
    setNewTaskDescription("");
    setNewTaskPlanned(0);
    fetchTasks();
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Är du säker på att du vill ta bort denna uppgift?")) return;

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

  return (
    <>
      <Card>
        <Collapsible open={expanded} onOpenChange={setExpanded}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50">
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
                {expanded ? <ChevronUp /> : <ChevronDown />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="space-y-4">
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
                      <TableHead>Objekt</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Åtgärder</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">{task.name}</TableCell>
                        <TableCell>{task.description || "-"}</TableCell>
                        <TableCell>{task.planned_count}</TableCell>
                        <TableCell>{task.reported_count}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedTaskId(task.id)}
                          >
                            Hantera objekt
                          </Button>
                        </TableCell>
                        <TableCell>{getStatusBadge(getStatus(task))}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTask(task.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Add new task form */}
              <div className="border-t pt-4 mt-4">
                <h3 className="text-sm font-medium mb-3">Lägg till ny uppgift</h3>
                <form onSubmit={handleAddTask} className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Input
                      placeholder="Uppgift *"
                      value={newTaskName}
                      onChange={(e) => setNewTaskName(e.target.value)}
                      required
                    />
                    <Input
                      placeholder="Beskrivning"
                      value={newTaskDescription}
                      onChange={(e) => setNewTaskDescription(e.target.value)}
                    />
                    <Input
                      type="number"
                      placeholder="Antal enheter"
                      value={newTaskPlanned || ""}
                      onChange={(e) => setNewTaskPlanned(parseInt(e.target.value) || 0)}
                      min="0"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm">
                      Skapa uppgift
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setNewTaskName("");
                        setNewTaskDescription("");
                        setNewTaskPlanned(0);
                      }}
                    >
                      Avbryt
                    </Button>
                  </div>
                </form>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {selectedTaskId && (
        <TaskObjectsDialog
          taskId={selectedTaskId}
          propertyId={propertyId}
          open={!!selectedTaskId}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedTaskId(null);
              fetchTasks();
            }
          }}
        />
      )}
    </>
  );
}
