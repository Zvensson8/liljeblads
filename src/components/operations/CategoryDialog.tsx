import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  parent_id: string | null;
}

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
}

export function CategoryDialog({
  open,
  onOpenChange,
  propertyId,
}: CategoryDialogProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && propertyId) {
      fetchCategories();
    }
  }, [open, propertyId]);

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from("drift_categories")
      .select("*")
      .eq("property_id", propertyId)
      .order("name");

    if (error) {
      toast.error("Kunde inte hämta kategorier");
      return;
    }

    setCategories(data || []);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newCategoryName.trim()) {
      toast.error("Namn krävs");
      return;
    }

    setLoading(true);

    const { error } = await supabase.from("drift_categories").insert({
      property_id: propertyId,
      name: newCategoryName.trim(),
    });

    setLoading(false);

    if (error) {
      toast.error("Kunde inte skapa kategori");
      return;
    }

    toast.success("Kategori skapad");
    setNewCategoryName("");
    fetchCategories();
  };

  const handleDeleteCategory = async (categoryId: string) => {
    const { error } = await supabase
      .from("drift_categories")
      .delete()
      .eq("id", categoryId);

    if (error) {
      toast.error("Kunde inte ta bort kategori");
      return;
    }

    toast.success("Kategori borttagen");
    fetchCategories();
  };

  const parentCategories = categories.filter((c) => !c.parent_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" aria-describedby="category-description">
        <DialogHeader>
          <DialogTitle>Hantera kategorier</DialogTitle>
          <DialogDescription id="category-description" className="sr-only">
            Skapa och hantera kategorier för driftuppgifter
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <form onSubmit={handleAddCategory} className="flex gap-2">
            <div className="flex-1">
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Ny kategori, t.ex. Service Entrépartier"
              />
            </div>
            <Button type="submit" disabled={loading}>
              <Plus className="h-4 w-4" />
              Lägg till
            </Button>
          </form>

          <div className="space-y-2">
            <Label>Befintliga kategorier</Label>
            {parentCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Inga kategorier ännu
              </p>
            ) : (
              <div className="border rounded-lg divide-y">
                {parentCategories.map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center justify-between p-3 hover:bg-muted/50"
                  >
                    <span className="font-medium">{category.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteCategory(category.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
