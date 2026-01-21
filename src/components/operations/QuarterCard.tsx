import { useState, useEffect } from "react";
import { Fragment } from "react";
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
import { TaskFormDialog } from "./TaskFormDialog";
import { exportQuarterToExcel } from "@/lib/operationsExport";
import { ComponentAutoDetect } from "./ComponentAutoDetect";
import { LinkedComponentCard } from "./LinkedComponentCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  auto_detected_from: string | null;
  manually_edited: boolean;
  component?: {
    id: string;
    name: string;
    type: string;
    room_zone: string | null;
    floor_id: string;
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
  propertyName: string;
  year: number;
}

export function QuarterCard({ quarter, propertyId, propertyName, year }: QuarterCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ completed: 0, remaining: 0, missing: 0, totalPlanned: 0, totalReported: 0, totalTasks: 0 });
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [taskObjects, setTaskObjects] = useState<Record<string, TaskObject[]>>({});
  const [availableComponents, setAvailableComponents] = useState<Component[]>([]);
  const [selectedComponentId, setSelectedComponentId] = useState<Record<string, string>>({});
  const [newObjectName, setNewObjectName] = useState<Record<string, string>>({});
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "remaining" | "missing">("all");
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkActionMode, setBulkActionMode] = useState(false);

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
    const completed = taskList.filter(t => t.reported_count >= t.planned_count).length;
    const remaining = taskList.filter(t => t.reported_count > 0 && t.reported_count < t.planned_count).length;
    const missing = taskList.filter(t => t.reported_count === 0).length;
    const totalPlanned = taskList.reduce((sum, t) => sum + t.planned_count, 0);
    const totalReported = taskList.reduce((sum, t) => sum + t.reported_count, 0);
    
    setStats({ completed, remaining, missing, totalPlanned, totalReported, totalTasks: taskList.length });
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

    const floorIds = floors.map(f => f.id);

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
        auto_detected_from,
        manually_edited,
        component:components (
          id,
          name,
          type,
          room_zone,
          floor_id,
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
      manually_edited: false,
    });

    if (error) {
      toast.error("Kunde inte lägga till objekt");
      return;
    }

    toast.success("Komponent tillagd");
    setSelectedComponentId(prev => ({ ...prev, [taskId]: "" }));
    fetchTaskObjects(taskId);
    // Removed fetchTasks() - no need to reload all tasks
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
      manually_edited: false,
    });

    if (error) {
      toast.error("Kunde inte lägga till objekt");
      return;
    }

    toast.success("Objekt tillagt");
    setNewObjectName(prev => ({ ...prev, [taskId]: "" }));
    fetchTaskObjects(taskId);
    // Removed fetchTasks() - no need to reload all tasks
  };

  const handleToggleReported = async (taskId: string, objectId: string, isReported: boolean) => {
    // Optimistic update - update local state immediately
    const newObjects = (taskObjects[taskId] || []).map(o =>
      o.id === objectId ? { ...o, is_reported: isReported } : o
    );
    setTaskObjects(prev => ({ ...prev, [taskId]: newObjects }));
    
    const reportedCount = newObjects.filter(o => o.is_reported).length;
    
    // Update tasks locally
    const updatedTasks = tasks.map(t =>
      t.id === taskId ? { ...t, reported_count: reportedCount } : t
    );
    setTasks(updatedTasks);
    calculateStats(updatedTasks);

    // Save to database in background
    const { error: objError } = await supabase
      .from("drift_task_components")
      .update({ is_reported: isReported })
      .eq("id", objectId);

    const { error: taskError } = await supabase
      .from("drift_tasks")
      .update({ reported_count: reportedCount })
      .eq("id", taskId);

    if (objError || taskError) {
      toast.error("Kunde inte spara ändring");
      // Revert on error
      fetchTaskObjects(taskId);
      fetchTasks();
    }
  };

  const handleRemoveObject = async (taskId: string, objectId: string) => {
    // Optimistic update - remove from local state immediately
    const currentObjects = taskObjects[taskId] || [];
    const newObjects = currentObjects.filter(o => o.id !== objectId);
    setTaskObjects(prev => ({ ...prev, [taskId]: newObjects }));

    const { error } = await supabase.from("drift_task_components").delete().eq("id", objectId);
    
    if (error) {
      toast.error("Kunde inte ta bort objekt");
      // Revert on error
      fetchTaskObjects(taskId);
      return;
    }
    
    toast.success("Objekt borttaget");
  };

  const handleUpdateField = async (taskId: string, field: keyof Task, value: any) => {
    // Optimistic update - update local state immediately (already done via onChange)
    const updatedTasks = tasks.map(t =>
      t.id === taskId ? { ...t, [field]: value } : t
    );
    setTasks(updatedTasks);
    calculateStats(updatedTasks);

    const { error } = await supabase
      .from("drift_tasks")
      .update({ [field]: value })
      .eq("id", taskId);

    if (error) {
      toast.error("Kunde inte uppdatera uppgift");
      // Revert on error
      fetchTasks();
    }
  };

  const handleExportQuarter = async () => {
    try {
      await exportQuarterToExcel(propertyId, propertyName, year, quarter);
      toast.success("Export slutförd");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Kunde inte exportera data");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Är du säker på att du vill ta bort denna uppgift?")) return;

    // Optimistic update - remove from local state immediately
    const updatedTasks = tasks.filter(t => t.id !== taskId);
    setTasks(updatedTasks);
    calculateStats(updatedTasks);

    const { error } = await supabase
      .from("drift_tasks")
      .delete()
      .eq("id", taskId);

    if (error) {
      toast.error("Kunde inte ta bort uppgift");
      // Revert on error
      fetchTasks();
      return;
    }

    toast.success("Uppgift borttagen");
  };

  const handleToggleTaskSelection = (taskId: string) => {
    const newSelected = new Set(selectedTaskIds);
    if (newSelected.has(taskId)) {
      newSelected.delete(taskId);
    } else {
      newSelected.add(taskId);
    }
    setSelectedTaskIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedTaskIds.size === filteredTasks.length) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(filteredTasks.map(t => t.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Är du säker på att du vill ta bort ${selectedTaskIds.size} uppgifter?`)) return;

    const { error } = await supabase
      .from("drift_tasks")
      .delete()
      .in("id", Array.from(selectedTaskIds));

    if (error) {
      toast.error("Kunde inte ta bort uppgifter");
      return;
    }

    toast.success(`${selectedTaskIds.size} uppgifter borttagna`);
    setSelectedTaskIds(new Set());
    setBulkActionMode(false);
    fetchTasks();
  };

  const handleBulkMarkReported = async () => {
    const updates = Array.from(selectedTaskIds).map(taskId => {
      const task = tasks.find(t => t.id === taskId);
      return supabase
        .from("drift_tasks")
        .update({ reported_count: task?.planned_count || 0 })
        .eq("id", taskId);
    });

    await Promise.all(updates);
    toast.success(`${selectedTaskIds.size} uppgifter markerade som klara`);
    setSelectedTaskIds(new Set());
    setBulkActionMode(false);
    fetchTasks();
  };

  const filteredTasks = tasks.filter(task => {
    const matchesSearch = 
      task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    
    const status = getStatus(task);
    const matchesStatus = statusFilter === "all" || status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Header color based on status: green only when ALL tasks are done
  const getHeaderColorClass = () => {
    if (stats.totalTasks === 0) return "bg-muted";
    if (stats.completed === stats.totalTasks) return "bg-green-500/20 border-green-500/50";
    if (stats.missing > 0) return "bg-red-500/20 border-red-500/50";
    return "bg-yellow-500/20 border-yellow-500/50";
  };

  return (
    <Card>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CardHeader className={`p-4 rounded-t-lg border-b ${getHeaderColorClass()}`}>
          <div className="flex items-center justify-between w-full gap-2">
            <CollapsibleTrigger className="flex items-center justify-between flex-1 hover:bg-muted/50 rounded-md p-2 -m-2">
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
                <span className="text-sm text-muted-foreground">{tasks.length} uppgifter</span>
                {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </CollapsibleTrigger>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                handleExportQuarter();
              }}
              title="Exportera kvartal"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap gap-3 pb-4 border-b">
              <Input
                placeholder="Sök uppgifter..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 min-w-[200px]"
              />
              <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla status</SelectItem>
                  <SelectItem value="completed">Klara</SelectItem>
                  <SelectItem value="remaining">Kvar</SelectItem>
                  <SelectItem value="missing">Saknas</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant={bulkActionMode ? "default" : "outline"}
                onClick={() => {
                  setBulkActionMode(!bulkActionMode);
                  setSelectedTaskIds(new Set());
                }}
              >
                {bulkActionMode ? "Avbryt val" : "Välj flera"}
              </Button>
            </div>

            {bulkActionMode && selectedTaskIds.size > 0 && (
              <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-md">
                <span className="text-sm font-medium">
                  {selectedTaskIds.size} valda
                </span>
                <div className="flex gap-2 ml-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBulkMarkReported}
                  >
                    Markera som klara
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleBulkDelete}
                  >
                    Ta bort valda
                  </Button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="text-center py-8">Laddar uppgifter...</div>
            ) : filteredTasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {tasks.length === 0 ? "Inga uppgifter för detta kvartal" : "Inga uppgifter matchar filtret"}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {bulkActionMode && (
                      <TableHead className="w-[40px]">
                        <Checkbox
                          checked={selectedTaskIds.size === filteredTasks.length && filteredTasks.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                    )}
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
                  {filteredTasks.map((task) => (
                    <Fragment key={task.id}>
                      <TableRow className="hover:bg-muted/50">
                        {bulkActionMode && (
                          <TableCell>
                            <Checkbox
                              checked={selectedTaskIds.has(task.id)}
                              onCheckedChange={() => handleToggleTaskSelection(task.id)}
                            />
                          </TableCell>
                        )}
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
                          <TableCell colSpan={bulkActionMode ? 9 : 8} className="bg-muted/30 p-4">
                            <div className="space-y-4">
                              {taskObjects[task.id] && taskObjects[task.id].length > 0 && (
                                <div className="space-y-3">
                                  <h4 className="text-sm font-semibold">
                                    Länkade objekt ({taskObjects[task.id].length})
                                  </h4>
                                  <div className="grid gap-2">
                                    {taskObjects[task.id].map((obj) => (
                                      <LinkedComponentCard
                                        key={obj.id}
                                        taskObject={obj}
                                        onEdit={() => toast.info("Redigering öppnas snart")}
                                        onUnlink={() => handleRemoveObject(task.id, obj.id)}
                                        onToggleReported={() => 
                                          handleToggleReported(task.id, obj.id, !obj.is_reported)
                                        }
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="rounded-md border">
                                <Tabs defaultValue="dropdown" className="w-full">
                                  <TabsList className="w-full grid grid-cols-3">
                                    <TabsTrigger value="dropdown">Välj från lista</TabsTrigger>
                                    <TabsTrigger value="manual">Skapa fristående</TabsTrigger>
                                    <TabsTrigger value="auto-detect">Auto-detektera</TabsTrigger>
                                  </TabsList>
                                  
                                  <TabsContent value="auto-detect" className="p-4">
                                    <ComponentAutoDetect
                                      propertyId={propertyId}
                                      onSelectComponent={async (component) => {
                                        const { error } = await supabase
                                          .from("drift_task_components")
                                          .insert({
                                            task_id: task.id,
                                            component_id: component.id,
                                            object_name: null,
                                            is_reported: false,
                                            series_id: component.serial_number || null,
                                            registration_number: component.registration_number || null,
                                            auto_detected_from: component.name,
                                            manually_edited: false,
                                          });

                                        if (error) {
                                          toast.error("Kunde inte länka komponent");
                                          return;
                                        }

                                        toast.success("Komponent länkad");
                                        fetchTaskObjects(task.id);
                                        fetchTasks();
                                      }}
                                    />
                                  </TabsContent>

                                  <TabsContent value="dropdown" className="p-4">
                                    <div className="space-y-3">
                                      {availableComponents.length === 0 ? (
                                        <p className="text-sm text-muted-foreground text-center py-4">
                                          Inga komponenter hittades för denna fastighet
                                        </p>
                                      ) : (
                                        <>
                                          <p className="text-sm text-muted-foreground">
                                            {availableComponents.length} komponenter tillgängliga
                                          </p>
                                          <div className="flex gap-2">
                                            <Select
                                              value={selectedComponentId[task.id] || ""}
                                              onValueChange={(value) =>
                                                setSelectedComponentId(prev => ({ ...prev, [task.id]: value }))
                                              }
                                            >
                                              <SelectTrigger className="flex-1">
                                                <SelectValue placeholder="Välj komponent..." />
                                              </SelectTrigger>
                                              <SelectContent className="max-h-[300px]">
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
                                              <Plus className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </TabsContent>

                                  <TabsContent value="manual" className="p-4">
                                    <div className="flex gap-2">
                                      <Input
                                        placeholder="Objektnamn..."
                                        value={newObjectName[task.id] || ""}
                                        onChange={(e) =>
                                          setNewObjectName(prev => ({ ...prev, [task.id]: e.target.value }))
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            handleAddObjectByName(task.id);
                                          }
                                        }}
                                      />
                                      <Button
                                        onClick={() => handleAddObjectByName(task.id)}
                                        size="sm"
                                      >
                                        <Plus className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TabsContent>
                                </Tabs>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="flex justify-end pt-4">
              <Button
                onClick={() => setTaskDialogOpen(true)}
                disabled={!propertyId}
              >
                <Plus className="h-4 w-4 mr-2" />
                Skapa ny uppgift
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      <TaskFormDialog
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        propertyId={propertyId}
        year={year}
        quarter={quarter}
        onSuccess={fetchTasks}
      />
    </Card>
  );
}
