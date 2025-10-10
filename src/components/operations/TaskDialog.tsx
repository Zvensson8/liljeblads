import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
}

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  year: number;
  quarter: Database["public"]["Enums"]["quarter_type"];
}

export function TaskDialog({
  open,
  onOpenChange,
  propertyId,
  year,
  quarter,
}: TaskDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [plannedCount, setPlannedCount] = useState<number>(0);
  const [categoryId, setCategoryId] = useState<string>("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && propertyId) {
      fetchCategories();
    }
  }, [open, propertyId]);

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from("drift_categories")
      .select("id, name")
      .eq("property_id", propertyId)
      .is("parent_id", null)
      .order("name");

    if (error) {
      console.error("Error fetching categories:", error);
      return;
    }

    setCategories(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.error("Namn krävs");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("drift_tasks").insert({
      property_id: propertyId,
      year,
      quarter: quarter as Database["public"]["Enums"]["quarter_type"],
      name: name.trim(),
      description: description.trim() || null,
      planned_count: plannedCount,
      category_id: categoryId || null,
      reported_count: 0,
    });

    setLoading(false);

    if (error) {
      toast.error("Kunde inte skapa uppgift");
      console.error("Error creating task:", error);
      return;
    }

    toast.success("Uppgift skapad");
    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setPlannedCount(0);
    setCategoryId("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lägg till uppgift - {quarter}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Namn *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="T.ex. Servicekontroll brandlarm"
            />
          </div>

          <div>
            <Label htmlFor="description">Beskrivning</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Valfri beskrivning"
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="category">Kategori</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Välj kategori (valfritt)" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="planned">Planerade antal</Label>
            <Input
              id="planned"
              type="number"
              min="0"
              value={plannedCount}
              onChange={(e) => setPlannedCount(parseInt(e.target.value) || 0)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Avbryt
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Skapar..." : "Skapa uppgift"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
