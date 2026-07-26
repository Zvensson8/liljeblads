import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { usePropertyInfoCategories } from "@/hooks/usePropertyInfoCategories";
import { useOrganization } from "@/hooks/useOrganization";
import { CategoryFieldDialog } from "./CategoryFieldDialog";
import { PropertyInfoCategory, PropertyInfoField } from "@/types/propertyInfo";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export function PropertyInfoCategoryManager() {
  const { organization } = useOrganization();
  const { categories, isLoading, createCategory, updateCategory, deleteCategory, createField, updateField, deleteField } = 
    usePropertyInfoCategories(organization?.id || null);

  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<PropertyInfoField | undefined>();
  const [editingCategory, setEditingCategory] = useState<PropertyInfoCategory | undefined>();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'category' | 'field'; id: string } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const [categoryName, setCategoryName] = useState('');
  const [categoryDescription, setCategoryDescription] = useState('');
  const [categoryIcon, setCategoryIcon] = useState('');

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const handleOpenCategoryDialog = (category?: PropertyInfoCategory) => {
    if (category) {
      setEditingCategory(category);
      setCategoryName(category.name);
      setCategoryDescription(category.description || '');
      setCategoryIcon(category.icon || '');
    } else {
      setEditingCategory(undefined);
      setCategoryName('');
      setCategoryDescription('');
      setCategoryIcon('');
    }
    setCategoryDialogOpen(true);
  };

  const handleSaveCategory = () => {
    if (!organization) return;

    const categoryData = {
      organization_id: organization.id,
      name: categoryName,
      description: categoryDescription,
      icon: categoryIcon,
    };

    if (editingCategory) {
      updateCategory.mutate({ ...categoryData, id: editingCategory.id });
    } else {
      createCategory.mutate(categoryData);
    }

    setCategoryDialogOpen(false);
  };

  const handleOpenFieldDialog = (categoryId: string, field?: PropertyInfoField) => {
    setSelectedCategoryId(categoryId);
    setEditingField(field);
    setFieldDialogOpen(true);
  };

  const handleSaveField = (fieldData: Partial<PropertyInfoField>) => {
    if (editingField) {
      updateField.mutate(fieldData as PropertyInfoField & { id: string });
    } else {
      if (!fieldData.category_id || !fieldData.field_name || !fieldData.field_type) {
        toast.error("Saknade obligatoriska fält");
        return;
      }
      createField.mutate({
        category_id: fieldData.category_id,
        field_name: fieldData.field_name,
        field_type: fieldData.field_type,
        options: fieldData.options,
        unit: fieldData.unit,
        placeholder: fieldData.placeholder,
        help_text: fieldData.help_text,
        display_order: fieldData.display_order,
        required: fieldData.required,
      });
    }
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === 'category') {
      deleteCategory.mutate(deleteTarget.id);
    } else {
      deleteField.mutate(deleteTarget.id);
    }

    setDeleteDialogOpen(false);
    setDeleteTarget(null);
  };

  if (isLoading) {
    return <div className="p-6">Laddar...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Fastighetsinformation</h2>
          <p className="text-muted-foreground">
            Hantera kategorier och fält för teknisk fastighetsinformation
          </p>
        </div>
        <Button onClick={() => handleOpenCategoryDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Ny kategori
        </Button>
      </div>

      <div className="space-y-4">
        {categories?.map((category) => (
          <Card key={category.id}>
            <Collapsible
              open={expandedCategories.has(category.id)}
              onOpenChange={() => toggleCategory(category.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm">
                        {expandedCategories.has(category.id) ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <div className="flex-1">
                      <CardTitle className="text-lg">{category.name}</CardTitle>
                      {category.description && (
                        <CardDescription className="mt-1">{category.description}</CardDescription>
                      )}
                    </div>
                    <Badge variant="secondary">{category.fields?.length || 0} fält</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenCategoryDialog(category)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDeleteTarget({ type: 'category', id: category.id });
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CollapsibleContent>
                <CardContent className="space-y-3">
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenFieldDialog(category.id)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Lägg till fält
                    </Button>
                  </div>

                  {category.fields && category.fields.length > 0 ? (
                    <div className="space-y-2">
                      {category.fields.map((field) => (
                        <div
                          key={field.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{field.field_name}</span>
                              <Badge variant="outline" className="text-xs">
                                {field.field_type}
                              </Badge>
                              {field.required && (
                                <Badge variant="destructive" className="text-xs">
                                  Obligatorisk
                                </Badge>
                              )}
                            </div>
                            {field.help_text && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {field.help_text}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenFieldDialog(category.id, field)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDeleteTarget({ type: 'field', id: field.id });
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-4">
                      Inga fält ännu. Lägg till ditt första fält!
                    </p>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}
      </div>

      {(!categories || categories.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Inga kategorier ännu. Skapa din första kategori för att komma igång!
            </p>
          </CardContent>
        </Card>
      )}

      <CategoryFieldDialog
        open={fieldDialogOpen}
        onOpenChange={setFieldDialogOpen}
        field={editingField}
        categoryId={selectedCategoryId}
        onSave={handleSaveField}
      />

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Redigera kategori' : 'Skapa ny kategori'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Namn *</Label>
              <Input
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="t.ex. Tekniska system"
              />
            </div>
            <div className="space-y-2">
              <Label>Beskrivning</Label>
              <Textarea
                value={categoryDescription}
                onChange={(e) => setCategoryDescription(e.target.value)}
                placeholder="Beskriv vad denna kategori innehåller"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Ikon (Lucide icon name)</Label>
              <Input
                value={categoryIcon}
                onChange={(e) => setCategoryIcon(e.target.value)}
                placeholder="t.ex. Wrench, Building, Lock"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={handleSaveCategory} disabled={!categoryName}>
              {editingCategory ? 'Uppdatera' : 'Skapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Är du säker?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'category'
                ? 'Detta kommer permanent ta bort kategorin och alla dess fält och värden.'
                : 'Detta kommer permanent ta bort fältet och alla dess värden.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
