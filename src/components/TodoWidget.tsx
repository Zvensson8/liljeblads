import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { CheckSquare, Calendar as CalendarIcon, Bell, Mail, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Todo {
  id: string;
  title: string;
  completed: boolean;
  due_date: string | null;
  created_at: string;
  notes?: string | null;
  reminder_date?: string | null;
  reminder_email?: string | null;
  properties: { 
    id: string;
    name: string 
  };
}

interface TodoWidgetProps {
  propertyId?: string;
}

export function TodoWidget({ propertyId }: TodoWidgetProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [reminderDate, setReminderDate] = useState<Date>();
  const [reminderEmail, setReminderEmail] = useState("");

  useEffect(() => {
    fetchTodos();
  }, [propertyId]);

  const fetchTodos = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("property_todos")
        .select("*, properties(id, name)")
        .eq("completed", false)
        .order("due_date", { ascending: true })
        .limit(10);

      if (propertyId) {
        query = query.eq("property_id", propertyId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setTodos(data || []);
    } catch (error: any) {
      console.error("Error fetching todos:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleComplete = async (todo: Todo) => {
    try {
      const { error } = await supabase
        .from("property_todos")
        .update({ completed: !todo.completed })
        .eq("id", todo.id);

      if (error) throw error;

      fetchTodos();
      toast.success(todo.completed ? "Markerad som ej klar" : "Markerad som klar");
    } catch (error: any) {
      toast.error("Kunde inte uppdatera uppgift");
    }
  };

  const handleOpenDetails = (todo: Todo) => {
    setSelectedTodo(todo);
    setNotes(todo.notes || "");
    setReminderDate(todo.reminder_date ? new Date(todo.reminder_date) : undefined);
    setReminderEmail(todo.reminder_email || "");
    setDetailsOpen(true);
  };

  const handleSaveDetails = async () => {
    if (!selectedTodo) return;

    try {
      const { error } = await supabase
        .from("property_todos")
        .update({
          notes,
          reminder_date: reminderDate?.toISOString().split("T")[0] || null,
          reminder_email: reminderEmail || null,
        })
        .eq("id", selectedTodo.id);

      if (error) throw error;

      toast.success("Uppgift uppdaterad");
      setDetailsOpen(false);
      fetchTodos();
    } catch (error: any) {
      toast.error("Kunde inte uppdatera uppgift");
    }
  };

  const setReminderPreset = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    setReminderDate(date);
  };

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
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : todos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Inga uppgifter
            </p>
          ) : (
            <div className="space-y-2">
              {todos.map((todo) => (
                <div
                  key={todo.id}
                  className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => handleOpenDetails(todo)}
                >
                  <div onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={todo.completed}
                      onCheckedChange={() => handleToggleComplete(todo)}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={cn(
                      "font-medium text-sm",
                      todo.completed && "line-through text-muted-foreground"
                    )}>
                      {todo.title}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {todo.properties?.name}
                    </div>
                    {todo.due_date && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <CalendarIcon className="h-3 w-3" />
                        {format(new Date(todo.due_date), "PPP", { locale: sv })}
                      </div>
                    )}
                    {todo.reminder_date && (
                      <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                        <Bell className="h-3 w-3" />
                        Påminnelse: {format(new Date(todo.reminder_date), "PPP", { locale: sv })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Todo Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedTodo?.title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Fastighet</Label>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedTodo?.properties?.name}
              </p>
            </div>

            <div>
              <Label htmlFor="notes">Anteckningar</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Lägg till anteckningar..."
                rows={4}
              />
            </div>

            <div>
              <Label>E-postpåminnelse</Label>
              <Input
                type="email"
                value={reminderEmail}
                onChange={(e) => setReminderEmail(e.target.value)}
                placeholder="din@email.com"
                className="mt-2"
              />
            </div>

            <div>
              <Label>Påminnelsedatum</Label>
              <div className="flex gap-2 mt-2 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setReminderPreset(1)}
                >
                  Imorgon
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setReminderPreset(7)}
                >
                  Om 1 vecka
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setReminderPreset(14)}
                >
                  Om 2 veckor
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setReminderPreset(30)}
                >
                  Om 1 månad
                </Button>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal mt-2",
                      !reminderDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {reminderDate ? (
                      format(reminderDate, "PPP", { locale: sv })
                    ) : (
                      "Välj datum"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-50" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={reminderDate}
                    onSelect={setReminderDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {reminderDate && reminderEmail && (
                <div className="flex items-start gap-2 mt-3 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                  <Mail className="h-4 w-4 text-amber-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-900 dark:text-amber-100">
                      E-postpåminnelse aktiv
                    </p>
                    <p className="text-amber-700 dark:text-amber-300">
                      Ett mail skickas till {reminderEmail} den{" "}
                      {format(reminderDate, "PPP", { locale: sv })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={handleSaveDetails}>
              Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
