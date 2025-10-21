import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Calendar } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface PropertyTodosProps {
  propertyId: string;
}

export function PropertyTodos({ propertyId }: PropertyTodosProps) {
  const [newTodo, setNewTodo] = useState("");
  const [newDueDate, setNewDueDate] = useState("");

  const { data: todos, refetch } = useQuery({
    queryKey: ["property-todos", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_todos")
        .select("*")
        .eq("property_id", propertyId)
        .order("completed")
        .order("due_date");

      if (error) throw error;
      return data;
    },
  });

  const handleAddTodo = async () => {
    if (!newTodo.trim()) return;

    const { error } = await supabase
      .from("property_todos")
      .insert([{ 
        property_id: propertyId, 
        title: newTodo,
        due_date: newDueDate || null
      }]);

    if (error) {
      toast.error("Kunde inte lägga till uppgift");
    } else {
      toast.success("Uppgift tillagd");
      setNewTodo("");
      setNewDueDate("");
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

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Ny uppgift..."
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleAddTodo()}
        />
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

      <div className="space-y-2">
        {todos && todos.length > 0 ? (
          todos.map((todo) => (
            <Card key={todo.id} className={todo.completed ? "opacity-60" : ""}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={todo.completed}
                    onCheckedChange={() => handleToggleTodo(todo.id, todo.completed)}
                  />
                  <div className="flex-1">
                    <p className={`text-sm ${todo.completed ? "line-through" : ""}`}>
                      {todo.title}
                    </p>
                    {todo.due_date && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(todo.due_date), "yyyy-MM-dd", { locale: sv })}
                      </div>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDeleteTodo(todo.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            Inga uppgifter ännu
          </div>
        )}
      </div>
    </div>
  );
}
