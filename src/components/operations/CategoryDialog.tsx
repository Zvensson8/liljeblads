import { useState } from "react";
import {
  useDriftCategories,
  useCreateDriftCategory,
  useDeleteDriftCategory,
} from "@/hooks/useDriftCategories";
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
  const [newCategoryName, setNewCategoryName] = useState("");
  const { data: allCategories = [] } = useDriftCategories();
  const categories = (allCategories as Category[]).filter((c: any) => c.property_id === propertyId);
  const createCategory = useCreateDriftCategory();
  const deleteCategory = useDeleteDriftCategory();
  const loading = createCategory.isPending;

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newCategoryName.trim()) {
      toast.error("Namn krävs");
      return;
    }

    try {
      await createCategory.mutateAsync({
        property_id: propertyId,
        name: newCategoryName.trim(),
      } as any);
      toast.success("Kategori skapad");
      setNewCategoryName("");
    } catch {
      toast.error("Kunde inte skapa kategori");
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    try {
      await deleteCategory.mutateAsync(categoryId);
      toast.success("Kategori borttagen");
    } catch {
      toast.error("Kunde inte ta bort kategori");
    }
  };

  const parentCategories = (categories as Category[]).filter((c) => !c.parent_id);

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
