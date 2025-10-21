import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BookTemplate } from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  planned_count: number;
  quarters: string[];
  is_active: boolean;
}

interface TaskTemplateSelectorProps {
  propertyId: string;
  onSelectTemplate: (template: Template) => void;
  onOpenLibrary: () => void;
}

export function TaskTemplateSelector({
  propertyId,
  onSelectTemplate,
  onOpenLibrary,
}: TaskTemplateSelectorProps) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  useEffect(() => {
    if (user) {
      fetchTemplates();
    }
  }, [user]);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("drift_task_templates")
        .select("*")
        .eq("user_id", user?.id)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
    }
  };

  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      onSelectTemplate(template);
    }
  };

  return (
    <div className="space-y-2 p-4 bg-accent/30 rounded-lg border border-border">
      <div className="flex items-center justify-between">
        <Label>Använd mall (valfritt)</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onOpenLibrary}
        >
          <BookTemplate className="w-4 h-4 mr-2" />
          Hantera mallar
        </Button>
      </div>
      <Select value={selectedTemplateId} onValueChange={handleSelectTemplate}>
        <SelectTrigger>
          <SelectValue placeholder="Välj en mall..." />
        </SelectTrigger>
        <SelectContent>
          {templates.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              Inga mallar tillgängliga
            </div>
          ) : (
            templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                <div className="flex flex-col">
                  <span>{template.name}</span>
                  {template.description && (
                    <span className="text-xs text-muted-foreground">
                      {template.description}
                    </span>
                  )}
                </div>
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
