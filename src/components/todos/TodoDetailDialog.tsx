import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TodoSubtaskList } from "./TodoSubtaskList";
import { TodoAttachments } from "./TodoAttachments";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface TodoDetailDialogProps {
  todo: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export function TodoDetailDialog({ todo, open, onOpenChange, onUpdate }: TodoDetailDialogProps) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [category, setCategory] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const { data: subtaskCount } = useQuery({
    queryKey: ["subtask-count", todo?.id],
    enabled: !!todo?.id && !todo?.parent_todo_id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("property_todos")
        .select("*", { count: "exact", head: true })
        .eq("parent_todo_id", todo.id);

      if (error) throw error;
      return count || 0;
    },
  });

  const { data: attachmentCount } = useQuery({
    queryKey: ["attachment-count", todo?.id],
    enabled: !!todo?.id,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("todo_attachments")
        .select("*", { count: "exact", head: true })
        .eq("todo_id", todo.id);

      if (error) throw error;
      return count || 0;
    },
  });

  useEffect(() => {
    if (todo) {
      setTitle(todo.title || "");
      setNotes(todo.notes || "");
      setDueDate(todo.due_date || "");
      setPriority(todo.priority || "medium");
      setCategory(todo.category || "");
    }
  }, [todo]);

  const handleSave = async () => {
    if (!todo || !title.trim()) return;

    setIsSaving(true);

    const { error } = await supabase
      .from("property_todos")
      .update({
        title,
        notes,
        due_date: dueDate || null,
        priority,
        category: category || null,
      })
      .eq("id", todo.id);

    setIsSaving(false);

    if (error) {
      toast.error("Kunde inte spara ändringar");
    } else {
      toast.success("Ändringar sparade");
      onUpdate();
    }
  };

  const handleDelete = async () => {
    if (!todo) return;

    const { error } = await supabase
      .from("property_todos")
      .delete()
      .eq("id", todo.id);

    if (error) {
      toast.error("Kunde inte ta bort uppgift");
    } else {
      toast.success("Uppgift borttagen");
      onOpenChange(false);
      onUpdate();
    }
  };

  if (!todo) return null;

  const isParentTodo = !todo.parent_todo_id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isParentTodo ? "Redigera uppgift" : "Redigera underuppgift"}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="details" className="flex-1">Detaljer</TabsTrigger>
            {isParentTodo && (
              <TabsTrigger value="subtasks" className="flex-1">
                Underuppgifter
                {(subtaskCount || 0) > 0 && (
                  <Badge variant="secondary" className="ml-2">{subtaskCount}</Badge>
                )}
              </TabsTrigger>
            )}
            <TabsTrigger value="attachments" className="flex-1">
              Bilagor
              {(attachmentCount || 0) > 0 && (
                <Badge variant="secondary" className="ml-2">{attachmentCount}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titel</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Uppgiftens titel..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Anteckningar</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Lägg till anteckningar..."
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">Prioritet</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger id="priority">
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

              <div className="space-y-2">
                <Label htmlFor="category">Kategori</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Välj kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Ingen kategori</SelectItem>
                    <SelectItem value="Brandskydd">Brandskydd</SelectItem>
                    <SelectItem value="Underhåll">Underhåll</SelectItem>
                    <SelectItem value="Dokumentation">Dokumentation</SelectItem>
                    <SelectItem value="Besiktning">Besiktning</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="due_date">Förfallodatum</Label>
              <Input
                id="due_date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="pt-4 border-t space-y-1">
              <p className="text-xs text-muted-foreground">
                Skapad: {format(new Date(todo.created_at), "PPP", { locale: sv })}
              </p>
              <p className="text-xs text-muted-foreground">
                Uppdaterad: {format(new Date(todo.updated_at), "PPP", { locale: sv })}
              </p>
            </div>
          </TabsContent>

          {isParentTodo && (
            <TabsContent value="subtasks" className="mt-4">
              <TodoSubtaskList
                parentTodoId={todo.id}
                propertyId={todo.property_id}
                onUpdate={onUpdate}
              />
            </TabsContent>
          )}

          <TabsContent value="attachments" className="mt-4">
            <TodoAttachments todoId={todo.id} onUpdate={onUpdate} />
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button variant="destructive" onClick={handleDelete}>
            Ta bort
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !title.trim()}>
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
