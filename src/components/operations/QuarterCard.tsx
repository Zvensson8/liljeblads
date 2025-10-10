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
import { ChevronDown, ChevronUp, Trash2, Plus, CheckCircle2, AlertCircle, XCircle, Download, Link2, FileText, ExternalLink } from "lucide-react";
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
  component_id: string | null;
  object_name: string | null;
  is_reported: boolean;
  series_id: string | null;
  registration_number: string | null;
  component?: {
    name: string;
    type: string;
    serial_number: string | null;
    registration_number: string | null;
  } | null;
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
  const [newObjectName, setNewObjectName] = useState<Record<string, string>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  
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
        object_name,
        is_reported,
        series_id,
        registration_number,
        component:components (
          name,
          type,
          serial_number,
          registration_number
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

    // Fetch component to get serial_number and registration_number
    const { data: component } = await supabase
      .from("components")
      .select("serial_number, registration_number")
      .eq("id", componentId)
      .single();

    const { error } = await supabase.from("drift_task_components").insert({
      task_id: taskId,
      component_id: componentId,
      object_name: null,
      is_reported: false,
      series_id: component?.serial_number || null,
      registration_number: component?.registration_number || null,
    });

    if (error) {
      toast.error("Kunde inte lägga till objekt");
      return;
    }

    toast.success("Komponent tillagd");
    setSelectedComponentId(prev => ({ ...prev, [taskId]: "" }));
    fetchTaskObjects(taskId);
    fetchTasks();
  };

  const handleAddObjectByName = async (taskId: string) => {
    const objectName = newObjectName[taskId]?.trim();
    if (!objectName) {
      toast.error("Ange objektnamn");
      return;
    }

    const { error } = await supabase.from("drift_task_components").insert({
      task_id: taskId,
      component_id: null,
      object_name: objectName,
      is_reported: false,
      series_id: null,
      registration_number: null,
    });

    if (error) {
      toast.error("Kunde inte lägga till objekt");
      return;
    }

    toast.success("Objekt tillagt");
    setNewObjectName(prev => ({ ...prev, [taskId]: "" }));
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

  const handleUpdateObjectField = async (
    taskId: string,
    objectId: string,
    field: "series_id" | "registration_number",
    value: string
  ) => {
    await supabase
      .from("drift_task_components")
      .update({ [field]: value || null })
      .eq("id", objectId);

    fetchTaskObjects(taskId);
  };

  const handleRemoveObject = async (taskId: string, objectId: string) => {
    await supabase.from("drift_task_components").delete().eq("id", objectId);

    toast.success("Objekt borttaget");
    fetchTaskObjects(taskId);
    fetchTasks();
  };

  const handleUpdateField = async (taskId: string, field: keyof Task, value: any) => {
    const { error } = await supabase
      .from("drift_tasks")
      .update({ [field]: value })
      .eq("id", taskId);

    if (error) {
      toast.error("Kunde inte uppdatera uppgift");
      return;
    }

    fetchTasks();
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
                          <Input
                            value={task.name}
                            onChange={(e) => {
                              setTasks(tasks.map(t => 
                                t.id === task.id ? { ...t, name: e.target.value } : t
                              ));
                            }}
                            onBlur={(e) => handleUpdateField(task.id, "name", e.target.value)}
                            className="h-8 border-0 bg-transparent focus:bg-background focus:border-input"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={task.description || ""}
                            onChange={(e) => {
                              setTasks(tasks.map(t => 
                                t.id === task.id ? { ...t, description: e.target.value } : t
                              ));
                            }}
                            onBlur={(e) => handleUpdateField(task.id, "description", e.target.value || null)}
                            className="h-8 border-0 bg-transparent focus:bg-background focus:border-input"
                            placeholder="-"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={task.planned_count}
                            onChange={(e) => {
                              const value = parseInt(e.target.value) || 0;
                              setTasks(tasks.map(t => 
                                t.id === task.id ? { ...t, planned_count: value } : t
                              ));
                            }}
                            onBlur={(e) => handleUpdateField(task.id, "planned_count", parseInt(e.target.value) || 0)}
                            className="h-8 w-20 border-0 bg-transparent focus:bg-background focus:border-input"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={task.reported_count}
                            onChange={(e) => {
                              const value = parseInt(e.target.value) || 0;
                              setTasks(tasks.map(t => 
                                t.id === task.id ? { ...t, reported_count: value } : t
                              ));
                            }}
                            onBlur={(e) => handleUpdateField(task.id, "reported_count", parseInt(e.target.value) || 0)}
                            className="h-8 w-20 border-0 bg-transparent focus:bg-background focus:border-input"
                          />
                        </TableCell>
                        <TableCell>
                          {taskObjects[task.id]?.length || 0}
                        </TableCell>
                        <TableCell>{getStatusBadge(getStatus(task))}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTask(task.id)}
                            className="h-8 px-2"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expandedTaskId === task.id && (
                        <TableRow>
                          <TableCell colSpan={8} className="bg-muted/30 p-4">
                            <div className="space-y-4">
                              {/* Component-based objects section */}
                              {taskObjects[task.id]?.some(obj => obj.component_id) && (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Link2 className="h-4 w-4 text-primary" />
                                    <h4 className="text-sm font-semibold">
                                      Komponentbaserade objekt ({taskObjects[task.id]?.filter(obj => obj.component_id).length || 0})
                                    </h4>
                                  </div>
                                  <div className="rounded-md border">
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="bg-muted/50">
                                          <TableHead className="w-[40px]"></TableHead>
                                          <TableHead>Komponent</TableHead>
                                          <TableHead className="w-[140px]">Serie-ID</TableHead>
                                          <TableHead className="w-[140px]">Reg.nr</TableHead>
                                          <TableHead className="w-[120px]">Åtgärder</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {taskObjects[task.id]
                                          ?.filter(obj => obj.component_id)
                                          .map((obj) => {
                                            const seriesId = obj.component?.serial_number || "";
                                            const regNumber = obj.component?.registration_number || "";
                                            
                                            return (
                                              <TableRow key={obj.id} className="hover:bg-muted/30">
                                                <TableCell>
                                                  <Checkbox
                                                    checked={obj.is_reported}
                                                    onCheckedChange={(checked) =>
                                                      handleToggleReported(task.id, obj.id, checked as boolean)
                                                    }
                                                  />
                                                </TableCell>
                                                <TableCell>
                                                  <div className="flex items-start gap-2">
                                                    <Link2 className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                                                    <div>
                                                      <p className="text-sm font-medium">{obj.component?.name}</p>
                                                      <p className="text-xs text-muted-foreground">
                                                        {obj.component?.type}
                                                      </p>
                                                    </div>
                                                  </div>
                                                </TableCell>
                                                <TableCell>
                                                  <span className="text-sm text-muted-foreground">
                                                    {seriesId || "-"}
                                                  </span>
                                                </TableCell>
                                                <TableCell>
                                                  <span className="text-sm text-muted-foreground">
                                                    {regNumber || "-"}
                                                  </span>
                                                </TableCell>
                                                <TableCell>
                                                  <div className="flex gap-1">
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => {
                                                        // Navigate to component - could open in dialog or navigate to components page
                                                        toast.info("Visa komponent-funktion kommer snart");
                                                      }}
                                                      className="h-8 px-2"
                                                      title="Visa komponent"
                                                    >
                                                      <ExternalLink className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => handleRemoveObject(task.id, obj.id)}
                                                      className="h-8 px-2"
                                                      title="Ta bort"
                                                    >
                                                      <Trash2 className="h-4 w-4 text-destructive" />
                                                    </Button>
                                                  </div>
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              )}

                              {/* Standalone objects section */}
                              {taskObjects[task.id]?.some(obj => !obj.component_id) && (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-primary" />
                                    <h4 className="text-sm font-semibold">
                                      Fristående objekt ({taskObjects[task.id]?.filter(obj => !obj.component_id).length || 0})
                                    </h4>
                                  </div>
                                  <div className="rounded-md border">
                                    <Table>
                                      <TableHeader>
                                        <TableRow className="bg-muted/50">
                                          <TableHead className="w-[40px]"></TableHead>
                                          <TableHead>Objektnamn</TableHead>
                                          <TableHead className="w-[140px]">Serie-ID</TableHead>
                                          <TableHead className="w-[140px]">Reg.nr</TableHead>
                                          <TableHead className="w-[80px]">Åtgärder</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {taskObjects[task.id]
                                          ?.filter(obj => !obj.component_id)
                                          .map((obj) => {
                                            return (
                                              <TableRow key={obj.id} className="hover:bg-muted/30">
                                                <TableCell>
                                                  <Checkbox
                                                    checked={obj.is_reported}
                                                    onCheckedChange={(checked) =>
                                                      handleToggleReported(task.id, obj.id, checked as boolean)
                                                    }
                                                  />
                                                </TableCell>
                                                <TableCell>
                                                  <div className="flex items-center gap-2">
                                                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                    <p className="text-sm font-medium">{obj.object_name}</p>
                                                  </div>
                                                </TableCell>
                                                <TableCell>
                                                  <Input
                                                    type="text"
                                                    value={obj.series_id || ""}
                                                    onChange={(e) => {
                                                      const newObjects = taskObjects[task.id].map(o =>
                                                        o.id === obj.id ? { ...o, series_id: e.target.value } : o
                                                      );
                                                      setTaskObjects(prev => ({ ...prev, [task.id]: newObjects }));
                                                    }}
                                                    onBlur={(e) => {
                                                      handleUpdateObjectField(task.id, obj.id, "series_id", e.target.value);
                                                    }}
                                                    className="h-8 border-0 bg-transparent focus:bg-background focus:border-input"
                                                    placeholder="Serie-ID"
                                                  />
                                                </TableCell>
                                                <TableCell>
                                                  <Input
                                                    type="text"
                                                    value={obj.registration_number || ""}
                                                    onChange={(e) => {
                                                      const newObjects = taskObjects[task.id].map(o =>
                                                        o.id === obj.id ? { ...o, registration_number: e.target.value } : o
                                                      );
                                                      setTaskObjects(prev => ({ ...prev, [task.id]: newObjects }));
                                                    }}
                                                    onBlur={(e) => {
                                                      handleUpdateObjectField(task.id, obj.id, "registration_number", e.target.value);
                                                    }}
                                                    className="h-8 border-0 bg-transparent focus:bg-background focus:border-input"
                                                    placeholder="Reg.nr"
                                                  />
                                                </TableCell>
                                                <TableCell>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRemoveObject(task.id, obj.id)}
                                                    className="h-8 px-2"
                                                    title="Ta bort"
                                                  >
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                  </Button>
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              )}

                              {taskObjects[task.id]?.length === 0 && (
                                <div className="text-center py-6 border rounded-md bg-muted/20">
                                  <p className="text-sm text-muted-foreground">
                                    Inga objekt skapade ännu
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Lägg till objekt via formuläret nedan
                                  </p>
                                </div>
                              )}

                              <div className="space-y-2 pt-2 border-t">
                                <div className="flex gap-2">
                                  <Input
                                    placeholder="Nytt objektnamn..."
                                    value={newObjectName[task.id] || ""}
                                    onChange={(e) =>
                                      setNewObjectName({
                                        ...newObjectName,
                                        [task.id]: e.target.value,
                                      })
                                    }
                                    className="flex-1"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && newObjectName[task.id]?.trim()) {
                                        handleAddObjectByName(task.id);
                                      }
                                    }}
                                  />
                                  <Button
                                    onClick={() => handleAddObjectByName(task.id)}
                                    size="sm"
                                    disabled={!newObjectName[task.id]?.trim()}
                                  >
                                    <Plus className="h-4 w-4 mr-1" />
                                    Lägg till
                                  </Button>
                                </div>
                                
                                <div className="flex gap-2">
                                  <Select
                                    value={selectedComponentId[task.id] || ""}
                                    onValueChange={(value) =>
                                      setSelectedComponentId({
                                        ...selectedComponentId,
                                        [task.id]: value,
                                      })
                                    }
                                  >
                                    <SelectTrigger className="flex-1">
                                      <SelectValue placeholder="Eller välj från komponenter..." />
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
