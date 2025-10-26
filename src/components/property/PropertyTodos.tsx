import { useState } from "react";
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

interface PropertyTodosProps {
  propertyId: string;
  compact?: boolean;
}

export function PropertyTodos({ propertyId, compact = false }: PropertyTodosProps) {
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

  const { data: todos, refetch } = useQuery({
    queryKey: ["property-todos", propertyId, categoryFilter, priorityFilter, showCompleted],
    queryFn: async () => {
      let query: any = supabase
        .from("property_todos")
        .select("*")
        .eq("property_id", propertyId)
        .is("parent_todo_id", null);

      if (!showCompleted) {
        query = query.eq("completed", false);
      }

      if (categoryFilter) {
        query = query.eq("category", categoryFilter);
      }
      if (priorityFilter) {
        query = query.eq("priority", priorityFilter);
      }

      query = query
        .order("completed")
        .order("due_date");

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: subtasks } = useQuery({
    queryKey: ["subtasks-list", propertyId, Array.from(expandedTodos)],
    enabled: expandedTodos.size > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("property_todos")
        .select("*")
        .in("parent_todo_id", Array.from(expandedTodos))
        .order("order")
        .order("created_at");

      if (error) throw error;
      return data as any[];
    },
  });

  const { data: subtaskCounts } = useQuery({
    queryKey: ["subtask-counts", todos?.map(t => (t as any).id)],
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
    queryKey: ["attachment-counts", todos?.map(t => (t as any).id)],
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

  const handleAddTodo = async () => {
    if (!newTodo.trim()) return;

    const { error } = await supabase
      .from("property_todos")
      .insert([{
        property_id: propertyId,
        title: newTodo,
        due_date: newDueDate || null,
        priority: newPriority,
        category: newCategory === "none" ? null : newCategory || null,
      }]);

    if (error) {
      toast.error("Kunde inte lägga till uppgift");
    } else {
      toast.success("Uppgift tillagd");
      setNewTodo("");
      setNewDueDate("");
      setNewPriority("medium");
      setNewCategory("none");
      refetch();
    }
  };

  const handleToggleTodo = async (id: string, completed: boolean) => {
    const { error } = await supabase
      .from("property_todos")
      .update({ completed: !completed })
      .eq("id", id);

    if (error) {
      toast.error("Kunde inte uppdatera uppgift");
    } else {
      toast.success(completed ? "Uppgift återaktiverad" : "Uppgift slutförd");
      refetch();
    }
  };

  const handleDeleteTodo = async (id: string) => {
    const { error } = await supabase
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

  const displayTodos = compact ? (todos?.slice(0, 3) || []) : (todos || []);

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
            const todoSubtasks = subtasks?.filter((s: any) => s.parent_todo_id === todo.id) || [];
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
