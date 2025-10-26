import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ProjectTemplate {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  type: "investering" | "underhall" | "energi" | "annat";
  default_budget: number | null;
  checklist_items: any[];
  budget_categories: any[];
  estimated_duration_quarters: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const useProjectTemplates = (organizationId?: string) => {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTemplates = async () => {
    if (!organizationId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("project_templates")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name");

      if (error) throw error;
      setTemplates(data || []);
    } catch (error: any) {
      toast({
        title: "Kunde inte hämta mallar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [organizationId]);

  const createTemplate = async (template: Omit<ProjectTemplate, "id" | "created_at" | "updated_at">) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("project_templates")
        .insert({
          ...template,
          created_by: userData.user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Mall skapad",
        description: `Mallen "${template.name}" har skapats`,
      });

      fetchTemplates();
      return data;
    } catch (error: any) {
      toast({
        title: "Kunde inte skapa mall",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateTemplate = async (id: string, updates: Partial<ProjectTemplate>) => {
    try {
      const { error } = await supabase
        .from("project_templates")
        .update(updates)
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Mall uppdaterad",
        description: "Mallen har uppdaterats",
      });

      fetchTemplates();
    } catch (error: any) {
      toast({
        title: "Kunde inte uppdatera mall",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      const { error } = await supabase
        .from("project_templates")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Mall borttagen",
        description: "Mallen har tagits bort",
      });

      fetchTemplates();
    } catch (error: any) {
      toast({
        title: "Kunde inte ta bort mall",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  const duplicateTemplate = async (templateId: string) => {
    try {
      const template = templates.find((t) => t.id === templateId);
      if (!template) throw new Error("Mall hittades inte");

      const { id, created_at, updated_at, ...templateData } = template;
      await createTemplate({
        ...templateData,
        name: `${template.name} (kopia)`,
      });
    } catch (error: any) {
      toast({
        title: "Kunde inte duplicera mall",
        description: error.message,
        variant: "destructive",
      });
      throw error;
    }
  };

  return {
    templates,
    loading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate,
    refetch: fetchTemplates,
  };
};
