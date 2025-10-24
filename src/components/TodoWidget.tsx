import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckSquare, Calendar as CalendarIcon, Paperclip, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { TodoPriorityBadge } from "@/components/todos/TodoPriorityBadge";
import { TodoCategoryBadge } from "@/components/todos/TodoCategoryBadge";
import { TodoProgressBar } from "@/components/todos/TodoProgressBar";
import { TodoDetailDialog } from "@/components/todos/TodoDetailDialog";
import { toast } from "sonner";

interface Todo {
  id: string;
  title: string;
  completed: boolean;
  due_date: string | null;
  created_at: string;
  notes?: string | null;
  reminder_date?: string | null;
  reminder_email?: string | null;
  priority?: string;
  category?: string | null;
  parent_todo_id?: string | null;
  properties: {
    id: string;
    name: string;
  };
  subtasks?: any[];
  attachments?: any[];
}

interface TodoWidgetProps {
  propertyId?: string;
}

export function TodoWidget({ propertyId }: TodoWidgetProps) {
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [newTodo, setNewTodo] = useState("");
  const [newPropertyId, setNewPropertyId] = useState<string>("none");
  const [newPriority, setNewPriority] = useState("medium");
  const [newCategory, setNewCategory] = useState("none");
  const [newDueDate, setNewDueDate] = useState("");

  const { data: properties } = useQuery({
    queryKey: ["properties-for-todos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: todos, isLoading, refetch } = useQuery({
    queryKey: ["todos-widget", propertyId],
    queryFn: async () => {
      let query = supabase
        .from("property_todos")
        .select("*, properties(id, name)")
        .eq("completed", false)
        .is("parent_todo_id", null)
        .order("due_date", { ascending: true })
        .limit(10);

      if (propertyId) {
        query = query.eq("property_id", propertyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { data: subtasksData } = useQuery({
    queryKey: ["subtasks-widget", todos?.map(t => (t as any).id)],
    enabled: !!todos && todos.length > 0,
    queryFn: async () => {
      if (!todos || todos.length === 0) return {};

      const todoIds = todos.map(t => (t as any).id);
      const { data, error } = await (supabase as any)
        .from("property_todos")
        .select("*")
        .in("parent_todo_id", todoIds);

      if (error) throw error;

      const grouped: Record<string, any[]> = {};
      data?.forEach((subtask: any) => {
        if (!grouped[subtask.parent_todo_id]) {
          grouped[subtask.parent_todo_id] = [];
        }
        grouped[subtask.parent_todo_id].push(subtask);
      });

      return grouped;
    },
  });

  const { data: subtaskCounts } = useQuery({
    queryKey: ["subtask-counts-widget", todos?.map(t => (t as any).id)],
    enabled: !!todos && todos.length > 0,
    queryFn: async () => {
      if (!todos || todos.length === 0) return {};

      const todoIds = todos.map(t => (t as any).id);
      const { data, error } = await (supabase as any)
        .from("property_todos")
        .select("parent_todo_id")
        .in("parent_todo_id", todoIds);

      if (error) throw error;

      const counts: Record<string, number> = {};
      data?.forEach((item: any) => {
        counts[item.parent_todo_id] = (counts[item.parent_todo_id] || 0) + 1;
      });

      return counts;
    },
  });

  const { data: attachmentCounts } = useQuery({
    queryKey: ["attachment-counts-widget", todos?.map(t => (t as any).id)],
    enabled: !!todos && todos.length > 0,
    queryFn: async () => {
      if (!todos || todos.length === 0) return {};

      const todoIds = todos.map(t => (t as any).id);
      const { data, error } = await (supabase as any)
        .from("todo_attachments")
        .select("todo_id")
        .in("todo_id", todoIds);

      if (error) throw error;

      const counts: Record<string, number> = {};
      data?.forEach((item: any) => {
        counts[item.todo_id] = (counts[item.todo_id] || 0) + 1;
      });

      return counts;
    },
  });

  const handleToggleComplete = async (id: string, completed: boolean) => {
    try {
      const { error } = await supabase
        .from("property_todos")
        .update({ completed: !completed })
        .eq("id", id);

      if (error) throw error;

      refetch();
      toast.success(completed ? "Markerad som ej klar" : "Markerad som klar");
    } catch (error: any) {
      toast.error("Kunde inte uppdatera uppgift");
    }
  };

  const openDetailDialog = (todo: Todo) => {
    setSelectedTodo(todo);
    setDetailDialogOpen(true);
  };

  const handleAddTodo = async () => {
    if (!newTodo.trim()) return;

    console.log("Adding todo with data:", {
      property_id: newPropertyId === "none" ? null : newPropertyId || null,
      title: newTodo,
      due_date: newDueDate || null,
      priority: newPriority,
      category: newCategory === "none" ? null : newCategory || null,
    });

    const { data, error } = await (supabase as any)
      .from("property_todos")
      .insert([{
        property_id: newPropertyId === "none" ? null : newPropertyId || null,
        title: newTodo,
        due_date: newDueDate || null,
        priority: newPriority,
        category: newCategory === "none" ? null : newCategory || null,
      }])
      .select();

    if (error) {
      console.error("Error adding todo:", error);
      toast.error(`Kunde inte lägga till uppgift: ${error.message}`);
    } else {
      console.log("Todo added successfully:", data);
      toast.success("Uppgift tillagd");
      setNewTodo("");
      setNewPropertyId("none");
      setNewPriority("medium");
      setNewCategory("none");
      setNewDueDate("");
      refetch();
    }
  };

  const handleDeleteTodo = async (id: string) => {
    const { error } = await (supabase as any)
      .from("property_todos")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Kunde inte ta bort uppgift");
    } else {
      toast.success("Uppgift borttagen");
      refetch();
    }
  };

  const groupedByCategory = (todos || []).reduce((acc: Record<string, any[]>, todo: any) => {
    const category = todo.category || "Okategoriserad";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(todo);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <>
      <Card className="hover:shadow-[var(--shadow-elegant)] transition-all">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckSquare className="h-5 w-5 text-primary" />
              Att göra
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Todo Form */}
          {!propertyId && (
            <div className="space-y-2 pb-4 border-b">
              <div className="flex gap-2">
                <Input
                  placeholder="Ny uppgift..."
                  value={newTodo}
                  onChange={(e) => setNewTodo(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && handleAddTodo()}
                  className="flex-1"
                />
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Låg</SelectItem>
                    <SelectItem value="medium">Medel</SelectItem>
                    <SelectItem value="high">Hög</SelectItem>
                    <SelectItem value="critical">Kritisk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Select value={newPropertyId} onValueChange={setNewPropertyId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Välj fastighet (valfritt)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen fastighet</SelectItem>
                    {properties?.map((property) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen</SelectItem>
                    <SelectItem value="Brandskydd">Brandskydd</SelectItem>
                    <SelectItem value="Underhåll">Underhåll</SelectItem>
                    <SelectItem value="Dokumentation">Dokumentation</SelectItem>
                    <SelectItem value="Besiktning">Besiktning</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-40"
                />
                <Button onClick={handleAddTodo} disabled={!newTodo.trim()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Lägg till
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : !todos || todos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Inga uppgifter
            </p>
          ) : (
            <Accordion type="multiple" defaultValue={Object.keys(groupedByCategory)} className="w-full">
              {Object.entries(groupedByCategory).map(([category, categoryTodos]: [string, any[]]) => (
                <AccordionItem key={category} value={category}>
                  <AccordionTrigger className="text-sm font-medium">
                    {category} ({categoryTodos.length})
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {categoryTodos.map((todo: any) => {
                        const hasSubtasks = (subtaskCounts?.[todo.id] || 0) > 0;
                        const todoSubtasks = subtasksData?.[todo.id] || [];
                        const completedSubtasks = todoSubtasks.filter((s: any) => s.completed).length;
                        const hasAttachments = (attachmentCounts?.[todo.id] || 0) > 0;

                        return (
                          <div
                            key={todo.id}
                            className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                          >
                            <div onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={todo.completed}
                                onCheckedChange={() => handleToggleComplete(todo.id, todo.completed)}
                              />
                            </div>
                            <div 
                              className="flex-1 min-w-0 space-y-2 cursor-pointer"
                              onClick={() => openDetailDialog(todo)}
                            >
                              <div className="flex items-start gap-2 flex-wrap">
                                <p className={cn(
                                  "text-sm flex-1",
                                  todo.completed && "line-through text-muted-foreground"
                                )}>
                                  {todo.title}
                                </p>
                                <div className="flex gap-1">
                                  <TodoPriorityBadge priority={(todo.priority || "medium") as any} />
                                  {hasAttachments && <Paperclip className="h-4 w-4 text-muted-foreground" />}
                                </div>
                              </div>

                              {todo.properties?.name && (
                                <div className="text-xs text-muted-foreground truncate">
                                  📍 {todo.properties?.name}
                                </div>
                              )}

                              {todo.due_date && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <CalendarIcon className="h-3 w-3" />
                                  {format(new Date(todo.due_date), "PPP", { locale: sv })}
                                </div>
                              )}

                              {hasSubtasks && (
                                <TodoProgressBar
                                  completed={completedSubtasks}
                                  total={todoSubtasks.length}
                                />
                              )}
                            </div>
                            
                            {!propertyId && (
                              <div onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleDeleteTodo(todo.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>

      <TodoDetailDialog
        todo={selectedTodo}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onUpdate={refetch}
      />
    </>
  );
}
