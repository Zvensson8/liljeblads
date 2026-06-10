import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ProjectTemplate {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  type: "investering" | "underhall" | "energi" | "annat";
  default_budget: number | null;
  checklist_items: unknown[];
  budget_categories: unknown[];
  estimated_duration_quarters: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const useProjectTemplates = (organizationId?: string) => {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(true);

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
      setTemplates((data as ProjectTemplate[]) || []);
    } catch {
      toast.error("Kunde inte hämta mallar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [organizationId]);

  return {
    templates,
    loading,
    refetch: fetchTemplates,
  };
};
