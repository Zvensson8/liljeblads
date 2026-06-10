import { useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateProjectPDFReport } from "@/lib/projectReportUtils";

interface ProjectReportButtonProps {
  projectId: string;
}

export const ProjectReportButton = ({ projectId }: ProjectReportButtonProps) => {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    try {
      setGenerating(true);

      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select(`*, properties (name, address)`)
        .eq("id", projectId)
        .single();

      if (projectError) throw projectError;

      const { data: costs } = await supabase
        .from("project_cost_items")
        .select("*")
        .eq("project_id", projectId)
        .order("cost_date", { ascending: false });

      const { data: checklistItems } = await supabase
        .from("project_checklist_items")
        .select("*")
        .eq("project_id", projectId)
        .order("order", { ascending: true });

      const { data: documents } = await supabase
        .from("project_documents")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      const { data: activityLog } = await supabase
        .from("project_activity_log")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(50);

      await generateProjectPDFReport(
        project,
        costs || [],
        checklistItems || [],
        documents || [],
        activityLog || []
      );

      toast.success("PDF-rapport genererad och nedladdad");
    } catch (error: unknown) {
      console.error("Error generating report:", error);
      toast.error("Kunde inte generera rapport: " + error.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button variant="outline" onClick={handleGenerate} disabled={generating}>
      <FileText className="h-4 w-4 mr-2" />
      {generating ? "Genererar..." : "Generera rapport"}
    </Button>
  );
};
