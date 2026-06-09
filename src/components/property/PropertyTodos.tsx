import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Calendar, ChevronDown, ChevronRight, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { TodoPriorityBadge } from "@/components/todos/TodoPriorityBadge";
import { TodoCategoryBadge } from "@/components/todos/TodoCategoryBadge";
import { TodoProgressBar } from "@/components/todos/TodoProgressBar";
import { TodoDetailDialog } from "@/components/todos/TodoDetailDialog";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import {
  useTodos,
  useCreateTodo,
  useUpdateTodo,
  useDeleteTodo,
} from "@/hooks/useTodos";

interface PropertyTodosProps {
  propertyId: string;
  compact?: boolean;
}

export function PropertyTodos({ propertyId, compact = false }: PropertyTodosProps) {
  const { user } = useAuth();
  const [newTodo, setNewTodo] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newCategory, setNewCategory] = useState("none");
  const [expandedTodos, setExpandedTodos] = useState<Set<string>>(new Set());
  const [selectedTodo, setSelectedTodo] = useState<any>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  // Single fetch of all todos for this property; derive top-level/subtasks client-side.
  const { data: allTodos, refetch } = useTodos({ propertyId });

  const createTodo = useCreateTodo();
  const updateTodo = useUpdateTodo();
  const deleteTodo = useDeleteTodo();

  const topLevel = useMemo(() => {
    const list = (allTodos ?? []).filter((t: any) => !t.parent_todo_id);
    return list
      .filter((t: any) => (showCompleted ? true : !t.completed))
      .filter((t: any) => (categoryFilter ? t.category === categoryFilter : true))
      .filter((t: any) => (priorityFilter ? t.priority === priorityFilter : true))
      .sort((a: any, b: any) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        const ad = a.due_date ?? "";
        const bd = b.due_date ?? "";
        return ad.localeCompare(bd);
      });
  }, [allTodos, categoryFilter, priorityFilter, showCompleted]);

  const subtasksByParent = useMemo(() => {
    const map: Record<string, any[]> = {};
    (allTodos ?? []).forEach((t: any) => {
      if (t.parent_todo_id) {
        (map[t.parent_todo_id] ||= []).push(t);
      }
    });
    return map;
  }, [allTodos]);

  const subtaskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.entries(subtasksByParent).forEach(([k, v]) => (counts[k] = v.length));
    return counts;
  }, [subtasksByParent]);

  const { data: attachmentCounts } = useQuery({
    queryKey: ["attachment-counts", (allTodos ?? []).map((t: any) => t.id)],
    enabled: !!allTodos && allTodos.length > 0,
    queryFn: async () => {
      const todoIds = (allTodos ?? []).map((t: any) => t.id);
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

  const handleAddTodo = async () => {
    if (!newTodo.trim()) return;
    if (!user) {
      toast.error("Du måste vara inloggad");
      return;
    }

    try {
      await createTodo.mutateAsync({
        property_id: propertyId,
        title: newTodo,
        due_date: newDueDate || null,
        priority: newPriority,
        category: newCategory === "none" ? null : newCategory || null,
        user_id: user.id,
      } as any);
      toast.success("Uppgift tillagd");
      setNewTodo("");
      setNewDueDate("");
      setNewPriority("medium");
      setNewCategory("none");
    } catch {
      // toast handled in hook
    }
  };

  const handleToggleTodo = async (id: string, completed: boolean) => {
    try {
      await updateTodo.mutateAsync({ id, patch: { completed: !completed } as any });
      toast.success(completed ? "Uppgift återaktiverad" : "Uppgift slutförd");
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

  const toggleExpanded = (todoId: string) => {
    setExpandedTodos(prev => {
      const next = new Set(prev);
      if (next.has(todoId)) {
        next.delete(todoId);
      } else {
        next.add(todoId);
      }
      return next;
    });
  };

  const openDetailDialog = (todo: any) => {
    setSelectedTodo(todo);
    setDetailDialogOpen(true);
  };

  const displayTodos = compact ? topLevel.slice(0, 3) : topLevel;

  return (
    <div className="space-y-4">
      {!compact ? (
        <>
          <div className="flex gap-2 items-center justify-between">
            <div className="flex gap-2">
              <Select value={categoryFilter || "all"} onValueChange={(v) => setCategoryFilter(v === "all" ? null : v)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Kategori" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla kategorier</SelectItem>
                  <SelectItem value="Brandskydd">Brandskydd</SelectItem>
                  <SelectItem value="Underhåll">Underhåll</SelectItem>
                  <SelectItem value="Dokumentation">Dokumentation</SelectItem>
                  <SelectItem value="Besiktning">Besiktning</SelectItem>
                </SelectContent>
              </Select>

              <Select value={priorityFilter || "all"} onValueChange={(v) => setPriorityFilter(v === "all" ? null : v)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Prioritet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alla prioriteter</SelectItem>
                  <SelectItem value="critical">Kritisk</SelectItem>
                  <SelectItem value="high">Hög</SelectItem>
                  <SelectItem value="medium">Medel</SelectItem>
                  <SelectItem value="low">Låg</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCompleted(!showCompleted)}
            >
              {showCompleted ? "Dölj slutförda" : "Visa slutförda"}
            </Button>
          </div>

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
              placeholder="Deadline"
              title="Deadline"
            />
            <Button onClick={handleAddTodo} disabled={!newTodo.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              Lägg till
            </Button>
          </div>
        </>
      ) : (
        <div className="flex gap-2 mb-2">
          <Input
            placeholder="Snabblägg till uppgift..."
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleAddTodo()}
            className="flex-1"
          />
          <Button onClick={handleAddTodo} disabled={!newTodo.trim()} size="sm">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {displayTodos && displayTodos.length > 0 ? (
          displayTodos.map((todo: any) => {
            const hasSubtasks = (subtaskCounts?.[todo.id] || 0) > 0;
            const isExpanded = expandedTodos.has(todo.id);
            const todoSubtasks = subtasksByParent[todo.id] || [];
            const completedSubtasks = todoSubtasks.filter((s: any) => s.completed).length;
            const hasAttachments = (attachmentCounts?.[todo.id] || 0) > 0;

            return (
              <div key={todo.id}>
                <Card className={cn(todo.completed && "opacity-60 bg-muted/20")}>
                  <CardContent className="pt-4">
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={todo.completed}
                          onCheckedChange={() => handleToggleTodo(todo.id, todo.completed)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-start gap-2 flex-wrap">
                            <p
                              className={`text-sm flex-1 cursor-pointer hover:text-primary ${
                                todo.completed ? "line-through" : ""
                              }`}
                              onClick={() => openDetailDialog(todo)}
                            >
                              {todo.title}
                            </p>
                            <div className="flex gap-1">
                              <TodoPriorityBadge priority={todo.priority || "medium"} />
                              <TodoCategoryBadge category={todo.category} />
                              {hasAttachments && (
                                <Paperclip className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>

                          {todo.due_date && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              <span>Deadline: {format(new Date(todo.due_date), "yyyy-MM-dd", { locale: sv })}</span>
                            </div>
                          )}

                          {hasSubtasks && !isExpanded && (
                            <TodoProgressBar
                              completed={completedSubtasks}
                              total={todoSubtasks.length}
                            />
                          )}
                        </div>

                        {hasSubtasks && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => toggleExpanded(todo.id)}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        )}

                        {!compact && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteTodo(todo.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>

                      {isExpanded && hasSubtasks && (
                        <div className="ml-8 pl-4 border-l-2 space-y-2">
                          <TodoProgressBar
                            completed={completedSubtasks}
                            total={todoSubtasks.length}
                          />
                          {todoSubtasks.map((subtask: any) => (
                            <div
                              key={subtask.id}
                              className={`flex items-center gap-3 p-2 rounded ${
                                subtask.completed ? "opacity-60" : ""
                              }`}
                            >
                              <Checkbox
                                checked={subtask.completed}
                                onCheckedChange={() => handleToggleTodo(subtask.id, subtask.completed)}
                              />
                              <span
                                className={`flex-1 text-sm cursor-pointer hover:text-primary ${
                                  subtask.completed ? "line-through" : ""
                                }`}
                                onClick={() => openDetailDialog(subtask)}
                              >
                                {subtask.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            Inga uppgifter ännu
          </div>
        )}
      </div>

      <TodoDetailDialog
        todo={selectedTodo}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        onUpdate={refetch}
      />
    </div>
  );
}
