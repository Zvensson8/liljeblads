import { useState } from "react";
import { Plus, Edit, Trash2, Copy, Eye } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useProjectTemplates, ProjectTemplate } from "@/hooks/useProjectTemplates";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ProjectTemplateManagerProps {
  organizationId: string;
}

export const ProjectTemplateManager = ({ organizationId }: ProjectTemplateManagerProps) => {
  const { templates, loading, createTemplate, updateTemplate, deleteTemplate, duplicateTemplate } = useProjectTemplates(organizationId);
  const { toast } = useToast();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProjectTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<ProjectTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<ProjectTemplate | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "underhall" as "investering" | "underhall" | "energi" | "annat",
    default_budget: "",
    estimated_duration_quarters: "",
    checklist_items: "[]",
    budget_categories: "[]",
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      type: "underhall",
      default_budget: "",
      estimated_duration_quarters: "",
      checklist_items: "[]",
      budget_categories: "[]",
    });
    setEditingTemplate(null);
  };

  const handleOpenDialog = (template?: ProjectTemplate) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        name: template.name,
        description: template.description || "",
        type: template.type,
        default_budget: template.default_budget?.toString() || "",
        estimated_duration_quarters: template.estimated_duration_quarters?.toString() || "",
        checklist_items: JSON.stringify(template.checklist_items, null, 2),
        budget_categories: JSON.stringify(template.budget_categories, null, 2),
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      let checklistItems = [];
      let budgetCategories = [];

      try {
        checklistItems = JSON.parse(formData.checklist_items);
      } catch (e) {
        toast({
          title: "Ogiltigt JSON-format",
          description: "Checklistpunkter måste vara i giltigt JSON-format",
          variant: "destructive",
        });
        return;
      }

      try {
        budgetCategories = JSON.parse(formData.budget_categories);
      } catch (e) {
        toast({
          title: "Ogiltigt JSON-format",
          description: "Budgetkategorier måste vara i giltigt JSON-format",
          variant: "destructive",
        });
        return;
      }

      const templateData = {
        organization_id: organizationId,
        name: formData.name,
        description: formData.description || null,
        type: formData.type,
        default_budget: formData.default_budget ? Number(formData.default_budget) : null,
        estimated_duration_quarters: formData.estimated_duration_quarters ? Number(formData.estimated_duration_quarters) : null,
        checklist_items: checklistItems,
        budget_categories: budgetCategories,
      };

      if (editingTemplate) {
        await updateTemplate(editingTemplate.id, templateData);
      } else {
        await createTemplate(templateData as any);
      }

      setDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error saving template:", error);
    }
  };

  const handleDelete = async () => {
    if (deletingTemplate) {
      await deleteTemplate(deletingTemplate.id);
      setDeleteDialogOpen(false);
      setDeletingTemplate(null);
    }
  };

  const handleDuplicate = async (templateId: string) => {
    await duplicateTemplate(templateId);
  };

  const handlePreview = (template: ProjectTemplate) => {
    setPreviewTemplate(template);
    setPreviewOpen(true);
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      investering: "Investering",
      underhall: "Underhåll",
      energi: "Energi",
      annat: "Annat",
    };
    return labels[type] || type;
  };

  const getTypeBadgeVariant = (type: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      investering: "default",
      underhall: "secondary",
      energi: "outline",
      annat: "outline",
    };
    return variants[type] || "outline";
  };

  if (loading) {
    return <div className="p-8 text-center">Laddar mallar...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Projektmallar</h3>
          <p className="text-sm text-muted-foreground">
            Skapa och hantera projektmallar för din organisation
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Ny mall
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-base">{template.name}</CardTitle>
                  <Badge variant={getTypeBadgeVariant(template.type)}>
                    {getTypeLabel(template.type)}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {template.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {template.description}
                  </p>
                )}
                
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {template.default_budget && (
                    <div>
                      <span className="text-muted-foreground">Budget:</span>
                      <div className="font-medium">
                        {template.default_budget.toLocaleString("sv-SE")} kr
                      </div>
                    </div>
                  )}
                  {template.estimated_duration_quarters && (
                    <div>
                      <span className="text-muted-foreground">Varaktighet:</span>
                      <div className="font-medium">
                        {template.estimated_duration_quarters} kvartal
                      </div>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Checklista:</span>
                    <div className="font-medium">
                      {template.checklist_items?.length || 0} punkter
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Kategorier:</span>
                    <div className="font-medium">
                      {template.budget_categories?.length || 0} st
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePreview(template)}
                    className="flex-1"
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    Visa
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenDialog(template)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDuplicate(template.id)}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDeletingTemplate(template);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {templates.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <p>Inga mallar skapade än. Klicka på "Ny mall" för att skapa din första mall.</p>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Redigera mall" : "Skapa ny mall"}
            </DialogTitle>
            <DialogDescription>
              Skapa en mall som kan användas för att snabbt skapa nya projekt
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Namn *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="T.ex. Fasadrenovering"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Beskrivning</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Beskriv projektmallen..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Typ *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value: any) => setFormData({ ...formData, type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="investering">Investering</SelectItem>
                    <SelectItem value="underhall">Underhåll</SelectItem>
                    <SelectItem value="energi">Energi</SelectItem>
                    <SelectItem value="annat">Annat</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="budget">Budget (kr)</Label>
                <Input
                  id="budget"
                  type="number"
                  value={formData.default_budget}
                  onChange={(e) => setFormData({ ...formData, default_budget: e.target.value })}
                  placeholder="500000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Förväntad varaktighet (kvartal)</Label>
              <Input
                id="duration"
                type="number"
                value={formData.estimated_duration_quarters}
                onChange={(e) =>
                  setFormData({ ...formData, estimated_duration_quarters: e.target.value })
                }
                placeholder="2"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="checklist">Checklistpunkter (JSON)</Label>
              <Textarea
                id="checklist"
                value={formData.checklist_items}
                onChange={(e) => setFormData({ ...formData, checklist_items: e.target.value })}
                placeholder='[{"title": "Besiktning", "description": "...", "deadline_offset_days": 7}]'
                rows={6}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Format: {`[{"title": "...", "description": "...", "responsible": "...", "deadline_offset_days": 7}]`}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="categories">Budgetkategorier (JSON)</Label>
              <Textarea
                id="categories"
                value={formData.budget_categories}
                onChange={(e) => setFormData({ ...formData, budget_categories: e.target.value })}
                placeholder='[{"name": "Material", "estimated_amount": 200000}]'
                rows={4}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Format: {`[{"name": "Material", "estimated_amount": 200000}]`}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={handleSubmit}>
              {editingTemplate ? "Uppdatera" : "Skapa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{previewTemplate?.name}</DialogTitle>
            <DialogDescription>Förhandsvisning av projektmall</DialogDescription>
          </DialogHeader>

          {previewTemplate && (
            <ScrollArea className="h-[60vh] pr-4">
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold mb-2">Information</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Typ:</span>
                      <Badge variant={getTypeBadgeVariant(previewTemplate.type)}>
                        {getTypeLabel(previewTemplate.type)}
                      </Badge>
                    </div>
                    {previewTemplate.default_budget && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Budget:</span>
                        <span>{previewTemplate.default_budget.toLocaleString("sv-SE")} kr</span>
                      </div>
                    )}
                    {previewTemplate.estimated_duration_quarters && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Varaktighet:</span>
                        <span>{previewTemplate.estimated_duration_quarters} kvartal</span>
                      </div>
                    )}
                  </div>
                </div>

                {previewTemplate.description && (
                  <div>
                    <h4 className="font-semibold mb-2">Beskrivning</h4>
                    <p className="text-sm text-muted-foreground">{previewTemplate.description}</p>
                  </div>
                )}

                {previewTemplate.checklist_items && previewTemplate.checklist_items.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Checklista ({previewTemplate.checklist_items.length} punkter)</h4>
                    <div className="space-y-2">
                      {previewTemplate.checklist_items.map((item: any, index: number) => (
                        <div key={index} className="border rounded-lg p-3 text-sm">
                          <div className="font-medium">{item.title}</div>
                          {item.description && (
                            <div className="text-muted-foreground text-xs mt-1">{item.description}</div>
                          )}
                          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                            {item.responsible && <span>Ansvarig: {item.responsible}</span>}
                            {item.deadline_offset_days && (
                              <span>Deadline: +{item.deadline_offset_days} dagar från start</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {previewTemplate.budget_categories && previewTemplate.budget_categories.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Budgetkategorier</h4>
                    <div className="space-y-2">
                      {previewTemplate.budget_categories.map((category: any, index: number) => (
                        <div key={index} className="flex justify-between items-center border rounded-lg p-3 text-sm">
                          <span>{category.name}</span>
                          {category.estimated_amount && (
                            <span className="font-medium">
                              {Number(category.estimated_amount).toLocaleString("sv-SE")} kr
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Stäng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Är du säker?</AlertDialogTitle>
            <AlertDialogDescription>
              Detta kommer att ta bort mallen "{deletingTemplate?.name}". Befintliga projekt som använder denna mall påverkas inte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Ta bort</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
