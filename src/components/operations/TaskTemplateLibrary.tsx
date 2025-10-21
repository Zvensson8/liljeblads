import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2, Plus, CheckCircle2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

const templateSchema = z.object({
  name: z.string().min(1, "Namn krävs").max(100),
  description: z.string().optional(),
  category_id: z.string().uuid().optional(),
  planned_count: z.number().min(0).default(0),
  quarters: z.array(z.string()).min(1, "Välj minst ett kvartal"),
  is_active: z.boolean().default(true),
});

type TemplateFormValues = z.infer<typeof templateSchema>;

interface Template extends TemplateFormValues {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

interface Category {
  id: string;
  name: string;
}

interface TaskTemplateLibraryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  onSelectTemplate?: (template: Template) => void;
}

export function TaskTemplateLibrary({
  open,
  onOpenChange,
  propertyId,
  onSelectTemplate,
}: TaskTemplateLibraryProps) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [showForm, setShowForm] = useState(false);

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
      description: "",
      category_id: undefined,
      planned_count: 0,
      quarters: [],
      is_active: true,
    },
  });

  useEffect(() => {
    if (open && user) {
      fetchTemplates();
      fetchCategories();
    }
  }, [open, user]);

  useEffect(() => {
    if (editingTemplate) {
      form.reset({
        name: editingTemplate.name,
        description: editingTemplate.description || "",
        category_id: editingTemplate.category_id || undefined,
        planned_count: editingTemplate.planned_count,
        quarters: editingTemplate.quarters,
        is_active: editingTemplate.is_active,
      });
    }
  }, [editingTemplate]);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("drift_task_templates")
        .select("*")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error: any) {
      toast.error("Kunde inte hämta mallar");
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("drift_categories")
        .select("id, name")
        .eq("property_id", propertyId)
        .order("name");

      if (error) throw error;
      setCategories(data || []);
    } catch (error: any) {
      console.error("Error fetching categories:", error);
    }
  };

  const onSubmit = async (values: TemplateFormValues) => {
    try {
      if (editingTemplate) {
        const { error } = await supabase
          .from("drift_task_templates")
          .update(values)
          .eq("id", editingTemplate.id);

        if (error) throw error;
        toast.success("Mall uppdaterad");
      } else {
        const { error } = await supabase
          .from("drift_task_templates")
          .insert({ ...values, user_id: user?.id } as any);

        if (error) throw error;
        toast.success("Mall skapad");
      }

      form.reset();
      setEditingTemplate(null);
      setShowForm(false);
      fetchTemplates();
    } catch (error: any) {
      toast.error("Kunde inte spara mall");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Är du säker på att du vill ta bort denna mall?")) return;

    try {
      const { error } = await supabase
        .from("drift_task_templates")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Mall borttagen");
      fetchTemplates();
    } catch (error: any) {
      toast.error("Kunde inte ta bort mall");
    }
  };

  const handleUseTemplate = (template: Template) => {
    if (onSelectTemplate) {
      onSelectTemplate(template);
      onOpenChange(false);
    }
  };

  const quarters = ["Q1", "Q2", "Q3", "Q4"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Mallbibliotek</span>
            <Button
              onClick={() => {
                setEditingTemplate(null);
                form.reset();
                setShowForm(true);
              }}
              size="sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Ny mall
            </Button>
          </DialogTitle>
        </DialogHeader>

        {showForm || editingTemplate ? (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="name">Namn</Label>
              <Input
                id="name"
                {...form.register("name")}
                placeholder="T.ex. Ventilationsservice"
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="description">Beskrivning</Label>
              <Textarea
                id="description"
                {...form.register("description")}
                placeholder="Valfri beskrivning..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Kategori</Label>
                <Select
                  value={form.watch("category_id") || ""}
                  onValueChange={(value) =>
                    form.setValue("category_id", value || undefined)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Välj kategori" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Ingen kategori</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="planned_count">Planerat antal</Label>
                <Input
                  id="planned_count"
                  type="number"
                  min="0"
                  {...form.register("planned_count", { valueAsNumber: true })}
                />
              </div>
            </div>

            <div>
              <Label>Kvartal</Label>
              <div className="flex gap-4 mt-2">
                {quarters.map((q) => (
                  <div key={q} className="flex items-center space-x-2">
                    <Checkbox
                      id={`quarter-${q}`}
                      checked={form.watch("quarters")?.includes(q)}
                      onCheckedChange={(checked) => {
                        const current = form.watch("quarters") || [];
                        if (checked) {
                          form.setValue("quarters", [...current, q]);
                        } else {
                          form.setValue(
                            "quarters",
                            current.filter((item) => item !== q)
                          );
                        }
                      }}
                    />
                    <Label htmlFor={`quarter-${q}`}>{q}</Label>
                  </div>
                ))}
              </div>
              {form.formState.errors.quarters && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.quarters.message}
                </p>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={form.watch("is_active")}
                onCheckedChange={(checked) => form.setValue("is_active", checked)}
              />
              <Label htmlFor="is_active">Aktiv mall</Label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setEditingTemplate(null);
                  form.reset();
                }}
              >
                Avbryt
              </Button>
              <Button type="submit">
                {editingTemplate ? "Uppdatera" : "Skapa"} mall
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Laddar mallar...
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Inga mallar ännu. Skapa din första mall!
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">{template.name}</h3>
                          {!template.is_active && (
                            <Badge variant="secondary">Inaktiv</Badge>
                          )}
                        </div>
                        {template.description && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {template.description}
                          </p>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          {template.quarters.map((q) => (
                            <Badge key={q} variant="outline">
                              {q}
                            </Badge>
                          ))}
                          {template.planned_count > 0 && (
                            <Badge variant="secondary">
                              {template.planned_count} st
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUseTemplate(template)}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          Använd
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingTemplate(template)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(template.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
