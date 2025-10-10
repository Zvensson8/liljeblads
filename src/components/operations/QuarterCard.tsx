import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { ChevronDown, ChevronUp, Trash2, Plus, CheckCircle2, AlertCircle, XCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface Task {
  id: string;
  name: string;
  description: string | null;
  planned_count: number;
  reported_count: number;
  category_id: string | null;
}

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
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [taskObjects, setTaskObjects] = useState<Record<string, TaskObject[]>>({});
  const [availableComponents, setAvailableComponents] = useState<Component[]>([]);
  const [selectedComponentId, setSelectedComponentId] = useState<Record<string, string>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<Task>>({});
  
  // Form state
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskPlanned, setNewTaskPlanned] = useState<number>(0);

  useEffect(() => {
    if (propertyId) {
      fetchTasks();
      fetchAvailableComponents();
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

  const fetchAvailableComponents = async () => {
    const { data: floors } = await supabase
      .from("floors")
      .select("id")
      .eq("property_id", propertyId);

    if (!floors) return;

    const floorIds = floors.map((f) => f.id);

    const { data: components } = await supabase
      .from("components")
      .select("id, name, type")
      .in("floor_id", floorIds)
      .order("name");

    setAvailableComponents(components || []);
  };

  const fetchTaskObjects = async (taskId: string) => {
    const { data } = await supabase
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

    setTaskObjects(prev => ({ ...prev, [taskId]: data || [] }));
  };

  const handleToggleTaskExpanded = (taskId: string) => {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
    } else {
      setExpandedTaskId(taskId);
      if (!taskObjects[taskId]) {
        fetchTaskObjects(taskId);
      }
    }
  };

  const handleAddComponent = async (taskId: string) => {
    const componentId = selectedComponentId[taskId];
    if (!componentId) {
      toast.error("Välj en komponent");
      return;
    }

    const { error } = await supabase.from("drift_task_components").insert({
      task_id: taskId,
      component_id: componentId,
      is_reported: false,
    });

    if (error) {
      toast.error("Kunde inte lägga till objekt");
      return;
    }

    const currentObjects = taskObjects[taskId] || [];
    await supabase
      .from("drift_tasks")
      .update({ planned_count: currentObjects.length + 1 })
      .eq("id", taskId);

    toast.success("Objekt tillagt");
    setSelectedComponentId(prev => ({ ...prev, [taskId]: "" }));
    fetchTaskObjects(taskId);
    fetchTasks();
  };

  const handleToggleReported = async (taskId: string, objectId: string, isReported: boolean) => {
    await supabase
      .from("drift_task_components")
      .update({ is_reported: isReported })
      .eq("id", objectId);

    const newObjects = (taskObjects[taskId] || []).map((o) =>
      o.id === objectId ? { ...o, is_reported: isReported } : o
    );
    const reportedCount = newObjects.filter((o) => o.is_reported).length;

    await supabase
      .from("drift_tasks")
      .update({ reported_count: reportedCount })
      .eq("id", taskId);

    fetchTaskObjects(taskId);
    fetchTasks();
  };

  const handleRemoveObject = async (taskId: string, objectId: string) => {
    await supabase.from("drift_task_components").delete().eq("id", objectId);

    const currentObjects = taskObjects[taskId] || [];
    await supabase
      .from("drift_tasks")
      .update({ 
        planned_count: Math.max(0, currentObjects.length - 1),
        reported_count: Math.max(0, currentObjects.filter(o => o.is_reported).length - 1)
      })
      .eq("id", taskId);

    toast.success("Objekt borttaget");
    fetchTaskObjects(taskId);
    fetchTasks();
  };

  const handleStartEdit = (task: Task) => {
    setEditingTaskId(task.id);
    setEditValues({
      name: task.name,
      description: task.description,
      planned_count: task.planned_count,
      reported_count: task.reported_count,
    });
  };

  const handleSaveEdit = async (taskId: string) => {
    const { error } = await supabase
      .from("drift_tasks")
      .update(editValues)
      .eq("id", taskId);

    if (error) {
      toast.error("Kunde inte uppdatera uppgift");
      return;
    }

    toast.success("Uppgift uppdaterad");
    setEditingTaskId(null);
    fetchTasks();
  };

  const handleCancelEdit = () => {
    setEditingTaskId(null);
    setEditValues({});
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
    setShowAddForm(false);
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
    <Card>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CardHeader className="cursor-pointer hover:bg-muted/50 p-4">
          <CollapsibleTrigger className="flex items-center justify-between w-full">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-semibold">{quarter}</h3>
              <div className="flex gap-3 text-sm">
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>Klara: {stats.completed}</span>
                </div>
                <div className="flex items-center gap-1">
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                  <span>Kvar: {stats.remaining}</span>
                </div>
                <div className="flex items-center gap-1">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span>Saknas: {stats.missing}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{tasks.length} klara</span>
              <Button variant="ghost" size="sm">
                <Download className="h-4 w-4" />
              </Button>
              {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4 p-4">
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
                    <TableHead className="w-[30px]"></TableHead>
                    <TableHead>Uppgift</TableHead>
                    <TableHead>Beskrivning</TableHead>
                    <TableHead className="w-[100px]">Planerade</TableHead>
                    <TableHead className="w-[100px]">Redovisade</TableHead>
                    <TableHead className="w-[100px]">Objekt</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[100px]">Åtgärder</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <>
                      <TableRow key={task.id} className="hover:bg-muted/50">
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleTaskExpanded(task.id)}
                            className="h-6 w-6 p-0"
                          >
                            {expandedTaskId === task.id ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>
                          {editingTaskId === task.id ? (
                            <Input
                              value={editValues.name}
                              onChange={(e) =>
                                setEditValues({ ...editValues, name: e.target.value })
                              }
                              className="h-8"
                            />
                          ) : (
                            <span className="font-medium">{task.name}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {editingTaskId === task.id ? (
                            <Input
                              value={editValues.description || ""}
                              onChange={(e) =>
                                setEditValues({ ...editValues, description: e.target.value })
                              }
                              className="h-8"
                            />
                          ) : (
                            task.description || "-"
                          )}
                        </TableCell>
                        <TableCell>
                          {editingTaskId === task.id ? (
                            <Input
                              type="number"
                              value={editValues.planned_count}
                              onChange={(e) =>
                                setEditValues({
                                  ...editValues,
                                  planned_count: parseInt(e.target.value) || 0,
                                })
                              }
                              className="h-8 w-20"
                            />
                          ) : (
                            task.planned_count
                          )}
                        </TableCell>
                        <TableCell>
                          {editingTaskId === task.id ? (
                            <Input
                              type="number"
                              value={editValues.reported_count}
                              onChange={(e) =>
                                setEditValues({
                                  ...editValues,
                                  reported_count: parseInt(e.target.value) || 0,
                                })
                              }
                              className="h-8 w-20"
                            />
                          ) : (
                            task.reported_count
                          )}
                        </TableCell>
                        <TableCell>
                          {taskObjects[task.id]?.length || 0}
                        </TableCell>
                        <TableCell>{getStatusBadge(getStatus(task))}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {editingTaskId === task.id ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleSaveEdit(task.id)}
                                  className="h-8 px-2"
                                >
                                  Spara
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={handleCancelEdit}
                                  className="h-8 px-2"
                                >
                                  Avbryt
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleStartEdit(task)}
                                  className="h-8 px-2"
                                >
                                  Redigera
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteTask(task.id)}
                                  className="h-8 px-2"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedTaskId === task.id && (
                        <TableRow>
                          <TableCell colSpan={8} className="bg-muted/30 p-4">
                            <div className="space-y-3">
                              <h4 className="text-sm font-medium">
                                Objekt ({taskObjects[task.id]?.length || 0})
                              </h4>
                              
                              {taskObjects[task.id]?.length > 0 && (
                                <div className="space-y-2">
                                  {taskObjects[task.id].map((obj) => (
                                    <div
                                      key={obj.id}
                                      className="flex items-center gap-3 bg-background p-2 rounded border"
                                    >
                                      <Checkbox
                                        checked={obj.is_reported}
                                        onCheckedChange={(checked) =>
                                          handleToggleReported(task.id, obj.id, checked as boolean)
                                        }
                                      />
                                      <div className="flex-1">
                                        <p className="text-sm font-medium">{obj.component.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                          {obj.component.type}
                                        </p>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemoveObject(task.id, obj.id)}
                                        className="h-8"
                                      >
                                        Ta bort
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {taskObjects[task.id]?.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center py-2">
                                  Inga objekt skapade ännu
                                </p>
                              )}

                              <div className="flex gap-2 pt-2 border-t">
                                <Input
                                  placeholder="Nytt objektnamn..."
                                  value={selectedComponentId[task.id] || ""}
                                  onChange={(e) =>
                                    setSelectedComponentId({
                                      ...selectedComponentId,
                                      [task.id]: e.target.value,
                                    })
                                  }
                                  className="flex-1"
                                />
                                <Select
                                  value={selectedComponentId[task.id] || ""}
                                  onValueChange={(value) =>
                                    setSelectedComponentId({
                                      ...selectedComponentId,
                                      [task.id]: value,
                                    })
                                  }
                                >
                                  <SelectTrigger className="w-[250px]">
                                    <SelectValue placeholder="Välj komponent" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableComponents.map((comp) => (
                                      <SelectItem key={comp.id} value={comp.id}>
                                        {comp.name} ({comp.type})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  onClick={() => handleAddComponent(task.id)}
                                  size="sm"
                                  disabled={!selectedComponentId[task.id]}
                                >
                                  <Plus className="h-4 w-4 mr-1" />
                                  Lägg till
                                </Button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* Add new task */}
            <div className="border-t pt-4 mt-4">
              {!showAddForm ? (
                <Button onClick={() => setShowAddForm(true)} variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Lägg till ny uppgift
                </Button>
              ) : (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Lägg till ny uppgift</h3>
                  <form onSubmit={handleAddTask} className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        type="number"
                        placeholder="Antal enheter"
                        value={newTaskPlanned || ""}
                        onChange={(e) => setNewTaskPlanned(parseInt(e.target.value) || 0)}
                        min="0"
                      />
                      <Input
                        type="number"
                        placeholder="Redan redovisade"
                        value={0}
                        disabled
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
                          setShowAddForm(false);
                        }}
                      >
                        Avbryt
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
