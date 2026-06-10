import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TodoProgressBar } from "./TodoProgressBar";

interface TodoSubtaskListProps {
  parentTodoId: string;
  propertyId: string;
  onUpdate: () => void;
}

export function TodoSubtaskList({ parentTodoId, propertyId, onUpdate }: TodoSubtaskListProps) {
  const { user } = useAuth();
  const [newSubtask, setNewSubtask] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  interface Subtask {
    id: string;
    title: string;
    completed: boolean;
  }

  const { data: subtasks, refetch } = useQuery<Subtask[]>({
    queryKey: ["subtasks", parentTodoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_todos")
        .select("*")
        .eq("parent_todo_id", parentTodoId)
        .order("order")
        .order("created_at");

      if (error) throw error;
      return (data ?? []) as unknown as Subtask[];
    },
  });

  const handleAddSubtask = async () => {
    if (!newSubtask.trim()) return;

    setIsAdding(true);
    const { error } = await supabase
      .from("property_todos")
      .insert({
        property_id: propertyId,
        parent_todo_id: parentTodoId,
        title: newSubtask,
        order: (subtasks?.length || 0) + 1,
        user_id: user?.id,
      });

    setIsAdding(false);

    if (error) {
      toast.error("Kunde inte lägga till underuppgift");
    } else {
      toast.success("Underuppgift tillagd");
      setNewSubtask("");
      refetch();
      onUpdate();
    }
  };

  const handleToggle = async (id: string, completed: boolean) => {
    const { error } = await supabase
      .from("property_todos")
      .update({ completed: !completed })
      .eq("id", id);

    if (error) {
      toast.error("Kunde inte uppdatera underuppgift");
    } else {
      refetch();
      onUpdate();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("property_todos")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Kunde inte ta bort underuppgift");
    } else {
      toast.success("Underuppgift borttagen");
      refetch();
      onUpdate();
    }
  };

  const completedCount = subtasks?.filter(s => s.completed).length || 0;
  const totalCount = subtasks?.length || 0;

  return (
    <div className="space-y-4">
      {totalCount > 0 && (
        <TodoProgressBar completed={completedCount} total={totalCount} />
      )}

      <div className="flex gap-2">
        <Input
          placeholder="Lägg till underuppgift..."
          value={newSubtask}
          onChange={(e) => setNewSubtask(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAddSubtask()}
          disabled={isAdding}
        />
        <Button onClick={handleAddSubtask} disabled={!newSubtask.trim() || isAdding}>
          <Plus className="h-4 w-4 mr-2" />
          Lägg till
        </Button>
      </div>

      <div className="space-y-2">
        {subtasks && subtasks.length > 0 ? (
          subtasks.map((subtask: any) => (
            <div
              key={subtask.id}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                subtask.completed ? "opacity-60 bg-muted/50" : "bg-card"
              }`}
            >
              <Checkbox
                checked={subtask.completed}
                onCheckedChange={() => handleToggle(subtask.id, subtask.completed)}
              />
              <span className={`flex-1 text-sm ${subtask.completed ? "line-through" : ""}`}>
                {subtask.title}
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => handleDelete(subtask.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        ) : (
          <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
            Inga underuppgifter ännu
          </div>
        )}
      </div>
    </div>
  );
}
