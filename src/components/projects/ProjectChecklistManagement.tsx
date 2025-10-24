import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { CheckCircle2, Circle, Calendar, Plus, ListTodo, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  deadline: string | null;
  responsible: string | null;
  order_index: number;
}

interface ProjectChecklistManagementProps {
  projectId: string;
  propertyId: string;
}

export function ProjectChecklistManagement({
  projectId,
  propertyId,
}: ProjectChecklistManagementProps) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newResponsible, setNewResponsible] = useState("");
  const [newDeadline, setNewDeadline] = useState<Date>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchChecklistItems();
  }, [projectId]);

  const fetchChecklistItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("project_checklist_items")
        .select("*")
        .eq("project_id", projectId)
        .order("order_index", { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (error: any) {
      toast.error("Kunde inte hämta checklista");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleComplete = async (item: ChecklistItem) => {
    try {
      const { error } = await supabase
        .from("project_checklist_items")
        .update({
          completed: !item.completed,
          completed_at: !item.completed ? new Date().toISOString() : null,
        })
        .eq("id", item.id);

      if (error) throw error;

      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, completed: !i.completed } : i
        )
      );

      // Log activity
      await supabase.from("project_activity_log").insert({
        project_id: projectId,
        activity_type: "checklist_update",
        description: `Checklistpunkt "${item.title}" markerad som ${!item.completed ? "klar" : "ej klar"}`,
      });

      toast.success(
        !item.completed ? "Markerad som klar" : "Markerad som ej klar"
      );
    } catch (error: any) {
      toast.error("Kunde inte uppdatera checklista");
    }
  };

  const handleAddItem = async () => {
    if (!newTitle.trim()) {
      toast.error("Titel krävs");
      return;
    }

    setSubmitting(true);
    try {
      const maxOrder = items.length > 0 ? Math.max(...items.map(i => i.order_index)) : 0;
      
      const { data, error } = await supabase
        .from("project_checklist_items")
        .insert({
          project_id: projectId,
          title: newTitle,
          description: newDescription || null,
          responsible: newResponsible || null,
          deadline: newDeadline ? newDeadline.toISOString().split("T")[0] : null,
          order_index: maxOrder + 1,
          completed: false,
        })
        .select()
        .single();

      if (error) throw error;

      setItems(prev => [...prev, data]);

      // Log activity
      await supabase.from("project_activity_log").insert({
        project_id: projectId,
        activity_type: "checklist_update",
        description: `Ny checklistpunkt tillagd: "${newTitle}"`,
      });

      toast.success("Checklistpunkt tillagd");
      setAddDialogOpen(false);
      setNewTitle("");
      setNewDescription("");
      setNewResponsible("");
      setNewDeadline(undefined);
    } catch (error: any) {
      toast.error("Kunde inte lägga till checklistpunkt");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddToPropertyTodos = async (item: ChecklistItem) => {
    try {
      const { error } = await supabase
        .from("property_todos")
        .insert({
          property_id: propertyId,
          title: item.title,
          due_date: item.deadline,
          completed: false,
        });

      if (error) throw error;

      toast.success("Tillagd i att göra-listan");
    } catch (error: any) {
      toast.error("Kunde inte lägga till i att göra-listan");
    }
  };

  const completedCount = items.filter((i) => i.completed).length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const isOverdue = (deadline: string | null, completed: boolean) => {
    if (!deadline || completed) return false;
    return new Date(deadline) < new Date();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Framsteg</h3>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {completedCount} av {totalCount} klara
            </span>
            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Lägg till punkt
            </Button>
          </div>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Checklist Items */}
      {items.length === 0 ? (
        <div className="text-center py-12">
          <Circle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-lg mb-2 text-muted-foreground">Ingen checklista</p>
          <p className="text-sm text-muted-foreground">
            Inga checklistpunkter har lagts till för detta projekt
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-start gap-4 p-4 border rounded-lg transition-colors ${
                item.completed ? "bg-muted/50" : "bg-background"
              } ${
                isOverdue(item.deadline, item.completed)
                  ? "border-red-300 bg-red-50/50"
                  : ""
              }`}
            >
              <Button
                variant="ghost"
                size="sm"
                className="p-0 h-auto hover:bg-transparent"
                onClick={() => handleToggleComplete(item)}
              >
                {item.completed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
              </Button>

              <div className="flex-1 space-y-1">
                <div className="flex items-start justify-between gap-4">
                  <h4
                    className={`font-medium ${
                      item.completed
                        ? "line-through text-muted-foreground"
                        : ""
                    }`}
                  >
                    {item.title}
                  </h4>
                  {isOverdue(item.deadline, item.completed) && (
                    <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-1 rounded whitespace-nowrap">
                      Försenad
                    </span>
                  )}
                </div>

                {item.description && (
                  <p className="text-sm text-muted-foreground">
                    {item.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {item.responsible && (
                    <span className="flex items-center gap-1">
                      <span className="font-medium">Ansvarig:</span>{" "}
                      {item.responsible}
                    </span>
                  )}
                  {item.deadline && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(item.deadline), "PPP", { locale: sv })}
                    </span>
                  )}
                </div>

                <div className="mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddToPropertyTodos(item)}
                    disabled={item.completed}
                  >
                    <ListTodo className="h-4 w-4 mr-2" />
                    Lägg till i att göra-lista
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Item Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lägg till checklistpunkt</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Titel *</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="T.ex. Granska ritningar"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Beskrivning</label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Detaljerad beskrivning..."
                rows={3}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Ansvarig</label>
              <Input
                value={newResponsible}
                onChange={(e) => setNewResponsible(e.target.value)}
                placeholder="Namn på ansvarig"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Deadline</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !newDeadline && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newDeadline ? format(newDeadline, "PPP", { locale: sv }) : "Välj datum"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 pointer-events-auto z-50" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={newDeadline}
                    onSelect={setNewDeadline}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
              disabled={submitting}
            >
              Avbryt
            </Button>
            <Button onClick={handleAddItem} disabled={submitting}>
              {submitting ? "Lägger till..." : "Lägg till"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
