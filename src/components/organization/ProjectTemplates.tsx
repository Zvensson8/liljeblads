import { useState } from "react";
import { Plus, Edit, Trash2, Copy, X } from "lucide-react";
import { useProjectTemplates } from "@/hooks/useProjectTemplates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface ProjectTemplatesProps {
  organizationId: string;
}

export const ProjectTemplates = ({ organizationId }: ProjectTemplatesProps) => {
  const { user } = useAuth();
  const { templates, loading, refetch } = useProjectTemplates(organizationId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "underhall" as "investering" | "underhall" | "energi" | "annat",
    estimated_duration_quarters: "",
    checklist_items: [] as Array<{ title: string; description: string }>,
  });
  const [checklistDialogOpen, setChecklistDialogOpen] = useState(false);
  const [newChecklistItem, setNewChecklistItem] = useState({ title: "", description: "" });

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      investering: "Investering",
      underhall: "Underhåll",
      energi: "Energi",
      annat: "Annat",
    };
    return labels[type] || type;
  };

  const handleOpenDialog = (template?: any) => {
    if (template) {
      setEditingTemplate(template);
      setFormData({
        name: template.name,
        description: template.description || "",
        type: template.type,
        estimated_duration_quarters: template.estimated_duration_quarters?.toString() || "",
        checklist_items: template.checklist_items || [],
      });
    } else {
      setEditingTemplate(null);
      setFormData({
        name: "",
        description: "",
        type: "underhall",
        estimated_duration_quarters: "",
        checklist_items: [],
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const templateData = {
        organization_id: organizationId,
        name: formData.name,
        description: formData.description || null,
        type: formData.type,
        estimated_duration_quarters: formData.estimated_duration_quarters ? Number(formData.estimated_duration_quarters) : null,
        checklist_items: formData.checklist_items,
        budget_categories: editingTemplate?.budget_categories || [],
      };

      if (editingTemplate) {
        const { error } = await supabase
          .from("project_templates")
          .update(templateData)
          .eq("id", editingTemplate.id);
        if (error) throw error;
        toast.success("Mall uppdaterad");
      } else {
        const { error } = await supabase
          .from("project_templates")
          .insert({ ...templateData, created_by: user?.id });
        if (error) throw error;
        toast.success("Mall skapad");
      }

      setDialogOpen(false);
      refetch();
    } catch (error: any) {
      toast.error("Kunde inte spara mall: " + error.message);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase
        .from("project_templates")
        .delete()
        .eq("id", deletingId);
      if (error) throw error;
      toast.success("Mall borttagen");
      setDeleteDialogOpen(false);
      refetch();
    } catch (error: any) {
      toast.error("Kunde inte ta bort mall: " + error.message);
    }
  };

  const handleDuplicate = async (template: any) => {
    try {
      const { error } = await supabase
        .from("project_templates")
        .insert({
          organization_id: organizationId,
          name: `${template.name} (kopia)`,
          description: template.description,
          type: template.type,
          estimated_duration_quarters: template.estimated_duration_quarters,
          checklist_items: template.checklist_items,
          budget_categories: template.budget_categories,
          created_by: user?.id,
        });
      if (error) throw error;
      toast.success("Mall duplicerad");
      refetch();
    } catch (error: any) {
      toast.error("Kunde inte duplicera mall: " + error.message);
    }
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
                  <Badge variant="secondary">
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
                </div>

                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => handleOpenDialog(template)}>
                    <Edit className="h-3 w-3 mr-1" />
                    Redigera
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDuplicate(template)}>
                    <Copy className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDeletingId(template.id);
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Redigera mall" : "Skapa ny mall"}</DialogTitle>
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
                <Label htmlFor="duration">Förväntad varaktighet (kvartal)</Label>
                <Input
                  id="duration"
                  type="number"
                  value={formData.estimated_duration_quarters}
                  onChange={(e) => setFormData({ ...formData, estimated_duration_quarters: e.target.value })}
                  placeholder="2"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Checklista ({formData.checklist_items.length} punkter)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setChecklistDialogOpen(true)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Lägg till
                </Button>
              </div>
              {formData.checklist_items.length > 0 && (
                <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
                  {formData.checklist_items.map((item, index) => (
                    <div key={index} className="p-3 flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{item.title}</div>
                        {item.description && (
                          <div className="text-xs text-muted-foreground truncate">
                            {item.description}
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newItems = [...formData.checklist_items];
                          newItems.splice(index, 1);
                          setFormData({ ...formData, checklist_items: newItems });
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
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

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Är du säker?</AlertDialogTitle>
            <AlertDialogDescription>
              Detta kommer att ta bort mallen. Befintliga projekt påverkas inte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Ta bort</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={checklistDialogOpen} onOpenChange={setChecklistDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lägg till checklistpunkt</DialogTitle>
            <DialogDescription>
              Skapa en ny punkt i projektmallens checklista
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="checklist-title">Titel *</Label>
              <Input
                id="checklist-title"
                value={newChecklistItem.title}
                onChange={(e) => setNewChecklistItem({ ...newChecklistItem, title: e.target.value })}
                placeholder="T.ex. Kontakta entreprenör"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="checklist-description">Beskrivning</Label>
              <Textarea
                id="checklist-description"
                value={newChecklistItem.description}
                onChange={(e) => setNewChecklistItem({ ...newChecklistItem, description: e.target.value })}
                placeholder="Valfri beskrivning..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setChecklistDialogOpen(false);
                setNewChecklistItem({ title: "", description: "" });
              }}
            >
              Avbryt
            </Button>
            <Button
              onClick={() => {
                if (newChecklistItem.title.trim()) {
                  setFormData({
                    ...formData,
                    checklist_items: [...formData.checklist_items, newChecklistItem],
                  });
                  setNewChecklistItem({ title: "", description: "" });
                  setChecklistDialogOpen(false);
                  toast.success("Checklistpunkt tillagd");
                }
              }}
            >
              Lägg till
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
