import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckSquare, Calendar as CalendarIcon, Paperclip } from "lucide-react";
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

  const { data: todos, isLoading, refetch } = useQuery({
    queryKey: ["todos-widget", propertyId],
    queryFn: async () => {
      let query = supabase
        .from("property_todos")
        .select(`
          *,
          properties(id, name),
          subtasks:property_todos!parent_todo_id(count),
          attachments:todo_attachments(count)
        `)
        .eq("completed", false)
        .is("parent_todo_id", null)
        .order("priority", { ascending: false })
        .order("due_date", { ascending: true })
        .limit(10);

      if (propertyId) {
        query = query.eq("property_id", propertyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: subtasksData } = useQuery({
    queryKey: ["subtasks-widget", todos?.map(t => t.id)],
    enabled: !!todos && todos.length > 0,
    queryFn: async () => {
      if (!todos || todos.length === 0) return {};

      const todoIds = todos.map(t => t.id);
      const { data, error } = await supabase
        .from("property_todos")
        .select("*")
        .in("parent_todo_id", todoIds);

      if (error) throw error;

      const grouped: Record<string, any[]> = {};
      data?.forEach(subtask => {
        if (!grouped[subtask.parent_todo_id]) {
          grouped[subtask.parent_todo_id] = [];
        }
        grouped[subtask.parent_todo_id].push(subtask);
      });

      return grouped;
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

  const groupedByCategory = todos?.reduce((acc, todo) => {
    const category = todo.category || "Okategoriserad";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(todo);
    return acc;
  }, {} as Record<string, typeof todos>);

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
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : !todos || todos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Inga uppgifter
            </p>
          ) : (
            <Accordion type="multiple" defaultValue={Object.keys(groupedByCategory || {})} className="w-full">
              {Object.entries(groupedByCategory || {}).map(([category, categoryTodos]) => (
                <AccordionItem key={category} value={category}>
                  <AccordionTrigger className="text-sm font-medium">
                    {category} ({categoryTodos.length})
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-2">
                      {categoryTodos.map((todo) => {
                        const hasSubtasks = (todo.subtasks?.[0]?.count || 0) > 0;
                        const todoSubtasks = subtasksData?.[todo.id] || [];
                        const completedSubtasks = todoSubtasks.filter((s: any) => s.completed).length;
                        const hasAttachments = (todo.attachments?.[0]?.count || 0) > 0;

                        return (
                          <div
                            key={todo.id}
                            className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => openDetailDialog(todo)}
                          >
                            <div onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={todo.completed}
                                onCheckedChange={() => handleToggleComplete(todo.id, todo.completed)}
                              />
                            </div>
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex items-start gap-2 flex-wrap">
                                <p className={cn(
                                  "text-sm flex-1",
                                  todo.completed && "line-through text-muted-foreground"
                                )}>
                                  {todo.title}
                                </p>
                                <div className="flex gap-1">
                                  <TodoPriorityBadge priority={todo.priority as any || "medium"} />
                                  {hasAttachments && <Paperclip className="h-4 w-4 text-muted-foreground" />}
                                </div>
                              </div>

                              <div className="text-xs text-muted-foreground truncate">
                                {todo.properties?.name}
                              </div>

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
