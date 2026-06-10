import { useMemo, useState } from "react";
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
import { TodoProgressBar } from "@/components/todos/TodoProgressBar";
import { TodoDetailDialog } from "@/components/todos/TodoDetailDialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useProperties } from "@/hooks/useProperties";
import {
  useTodos,
  useCreateTodo,
  useUpdateTodo,
  useDeleteTodo,
} from "@/hooks/useTodos";

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
  properties?: { id: string; name: string } | null;
  subtasks?: any[];
  attachments?: any[];
}

interface TodoWidgetProps {
  propertyId?: string;
}

export function TodoWidget({ propertyId }: TodoWidgetProps) {
  const { user } = useAuth();
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [newTodo, setNewTodo] = useState("");
  const [newPropertyId, setNewPropertyId] = useState<string>("none");
  const [newPriority, setNewPriority] = useState("medium");
  const [newCategory, setNewCategory] = useState("none");
  const [newDueDate, setNewDueDate] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  const { data: properties } = useProperties();
  const { data: allTodos, isLoading, refetch } = useTodos(propertyId ? { propertyId } : {});

  const createTodo = useCreateTodo();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();

  const propertyMap = useMemo(() => {
    const m: Record<string, { id: string; name: string }> = {};
    (properties ?? []).forEach((p: any) => (m[p.id] = { id: p.id, name: p.name }));
    return m;
  }, [properties]);

  const todos = useMemo(() => {
    return (allTodos ?? [])
      .filter((t: Todo) => !t.parent_todo_id)
      .filter((t: Todo) => (showCompleted ? true : !t.completed))
      .map((t: Todo) => ({
        ...t,
        properties: t.property_id ? propertyMap[t.property_id] ?? null : null,
      }))
      .sort((a: Todo, b: Todo) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
  }, [allTodos, showCompleted, propertyMap]);

  const subtasksData = useMemo(() => {
    const grouped: Record<string, Todo[]> = {};
    (allTodos ?? []).forEach((t: Todo) => {
      if (t.parent_todo_id) (grouped[t.parent_todo_id] ||= []).push(t);
    });
    return grouped;
  }, [allTodos]);

  const subtaskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.entries(subtasksData).forEach(([k, v]) => (counts[k] = v.length));
    return counts;
  }, [subtasksData]);

  const { data: attachmentCounts } = useQuery({
    queryKey: ["attachment-counts-widget", todos.map(t => t.id)],
    enabled: todos.length > 0,
    queryFn: async () => {
      const todoIds = todos.map(t => t.id);
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
      await updateTodo.mutateAsync({ id, patch: { completed: !completed } as any });
      toast.success(completed ? "Uppgift återaktiverad" : "Uppgift slutförd");
    } catch {
      // toast handled in hook
    }
  };

  const openDetailDialog = (todo: Todo) => {
    setSelectedTodo(todo);
    setDetailDialogOpen(true);
  };

  const handleAddTodo = async () => {
    if (!newTodo.trim()) return;
    if (!user) {
      toast.error("Du måste vara inloggad");
      return;
    }

    try {
      await createTodo.mutateAsync({
        property_id: newPropertyId === "none" ? null : newPropertyId || null,
        title: newTodo,
        due_date: newDueDate || null,
        priority: newPriority,
        category: newCategory === "none" ? null : newCategory || null,
        user_id: user.id,
      } as any);
      toast.success("Uppgift tillagd");
      setNewTodo("");
      setNewPropertyId("none");
      setNewPriority("medium");
      setNewCategory("none");
      setNewDueDate("");
    } catch {
      // toast handled in hook
    }
  };

  const handleDeleteTodo = async (id: string) => {
    try {
      await deleteTodo.mutateAsync(id);
      toast.success("Uppgift borttagen");
    } catch {
      // toast handled in hook
    }
  };

  const groupedByCategory = todos.reduce((acc: Record<string, Todo[]>, todo: any) => {
    const category = todo.category || "Okategoriserad";
    if (!acc[category]) acc[category] = [];
    acc[category].push(todo);
    return acc;
  }, {} as Record<string, Todo[]>);

  return (
    <>
      <Card className="hover:shadow-[var(--shadow-elegant)] transition-all">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckSquare className="h-5 w-5 text-primary" />
              Att göra
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCompleted(!showCompleted)}
            >
              {showCompleted ? "Dölj slutförda" : "Visa slutförda"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Todo Form */}
          {!propertyId && (
            <div className="space-y-3 pb-4 border-b">
              <Input
                placeholder="Ny uppgift..."
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddTodo()}
              />
              <div className="grid grid-cols-2 gap-2">
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger>
                    <SelectValue placeholder="Prioritet" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Låg</SelectItem>
                    <SelectItem value="medium">Medel</SelectItem>
                    <SelectItem value="high">Hög</SelectItem>
                    <SelectItem value="critical">Kritisk</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger>
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
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Select value={newPropertyId} onValueChange={setNewPropertyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Välj fastighet (valfritt)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ingen fastighet</SelectItem>
                    {properties?.map((property: any) => (
                      <SelectItem key={property.id} value={property.id}>
                        {property.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  placeholder="Deadline"
                />
              </div>
              <Button onClick={handleAddTodo} disabled={!newTodo.trim()} className="w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Lägg till
              </Button>
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
                      {categoryTodos.map((todo: Todo) => {
                        const hasSubtasks = (subtaskCounts?.[todo.id] || 0) > 0;
                        const todoSubtasks = subtasksData?.[todo.id] || [];
                        const completedSubtasks = todoSubtasks.filter((s: Todo) => s.completed).length;
                        const hasAttachments = (attachmentCounts?.[todo.id] || 0) > 0;

                        return (
                          <div
                            key={todo.id}
                            className={cn(
                              "flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors",
                              todo.completed && "opacity-60 bg-muted/20"
                            )}
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
                                  Deadline: {format(new Date(todo.due_date), "PPP", { locale: sv })}
                                </div>
                              )}

                              {hasSubtasks && (
                                <TodoProgressBar
                                  completed={completedSubtasks}
                                  total={todoSubtasks.length}
                                />
                              )}
                            </div>
                            
                            <div onClick={(e) => e.stopPropagation()} className="flex gap-1">
                              {!propertyId && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleDeleteTodo(todo.id)}
                                  title="Ta bort uppgift"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
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
