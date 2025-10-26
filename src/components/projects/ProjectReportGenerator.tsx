import { useState } from "react";
import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { generateProjectReport } from "@/lib/projectReportUtils";
import { supabase } from "@/integrations/supabase/client";

interface ProjectReportGeneratorProps {
  projectId: string;
  projectNumber?: string;
  projectName: string;
}

export const ProjectReportGenerator = ({
  projectId,
  projectNumber,
  projectName,
}: ProjectReportGeneratorProps) => {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const [options, setOptions] = useState({
    overview: true,
    economy: true,
    checklist: true,
    documents: true,
    activity: true,
  });

  const handleGenerate = async () => {
    try {
      setGenerating(true);

      // Fetch all project data
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select(
          `
          *,
          properties (
            name,
            address
          )
        `
        )
        .eq("id", projectId)
        .single();

      if (projectError) throw projectError;

      // Fetch cost items
      const { data: costs, error: costsError } = await supabase
        .from("project_cost_items")
        .select("*")
        .eq("project_id", projectId)
        .order("cost_date", { ascending: false });

      if (costsError) throw costsError;

      // Fetch checklist items
      const { data: checklistItems, error: checklistError } = await supabase
        .from("project_checklist_items")
        .select("*")
        .eq("project_id", projectId)
        .order("order", { ascending: true });

      if (checklistError) throw checklistError;

      // Fetch documents
      const { data: documents, error: documentsError } = await supabase
        .from("project_documents")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (documentsError) throw documentsError;

      // Fetch activity log
      const { data: activityLog, error: activityError } = await supabase
        .from("project_activity_log")
        .select(
          `
          *,
          profiles (
            full_name
          )
        `
        )
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (activityError) throw activityError;

      // Fetch organization info for logo
      const { data: userData } = await supabase.auth.getUser();
      let organizationLogo = undefined;
      let organizationName = undefined;

      if (userData.user) {
        const { data: orgMember } = await supabase
          .from("organization_members")
          .select(
            `
            organization_id,
            organizations (
              name,
              logo_url
            )
          `
          )
          .eq("user_id", userData.user.id)
          .single();

        if (orgMember && orgMember.organizations) {
          organizationName = (orgMember.organizations as any).name;
          organizationLogo = (orgMember.organizations as any).logo_url;
        }
      }

      // Generate PDF
      await generateProjectReport(
        project,
        costs || [],
        checklistItems || [],
        documents || [],
        activityLog || [],
        {
          includeSections: options,
          organizationLogo,
          organizationName,
        }
      );

      toast({
        title: "Rapport genererad",
        description: "PDF-rapporten har laddats ner",
      });

      setOpen(false);
    } catch (error: any) {
      console.error("Error generating report:", error);
      toast({
        title: "Kunde inte generera rapport",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileText className="h-4 w-4 mr-2" />
        Generera rapport
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generera Projektrapport</DialogTitle>
            <DialogDescription>
              Välj vilka sektioner som ska inkluderas i PDF-rapporten
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="overview"
                checked={options.overview}
                onCheckedChange={(checked) =>
                  setOptions({ ...options, overview: checked as boolean })
                }
              />
              <Label htmlFor="overview" className="cursor-pointer">
                Projektöversikt
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="economy"
                checked={options.economy}
                onCheckedChange={(checked) =>
                  setOptions({ ...options, economy: checked as boolean })
                }
              />
              <Label htmlFor="economy" className="cursor-pointer">
                Ekonomisk sammanfattning
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="checklist"
                checked={options.checklist}
                onCheckedChange={(checked) =>
                  setOptions({ ...options, checklist: checked as boolean })
                }
              />
              <Label htmlFor="checklist" className="cursor-pointer">
                Checklista
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="documents"
                checked={options.documents}
                onCheckedChange={(checked) =>
                  setOptions({ ...options, documents: checked as boolean })
                }
              />
              <Label htmlFor="documents" className="cursor-pointer">
                Dokument & Bilder
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="activity"
                checked={options.activity}
                onCheckedChange={(checked) =>
                  setOptions({ ...options, activity: checked as boolean })
                }
              />
              <Label htmlFor="activity" className="cursor-pointer">
                Aktivitetslogg
              </Label>
            </div>

            <div className="mt-4 p-4 bg-muted rounded-lg text-sm">
              <p className="font-medium mb-2">Rapporten kommer att innehålla:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Framsida med projektnummer och status</li>
                {options.overview && <li>Detaljerad projektöversikt</li>}
                {options.economy && <li>Ekonomisk analys med diagram</li>}
                {options.checklist && <li>Checklistestatus</li>}
                {options.documents && <li>Dokumentlista och QR-kod</li>}
                {options.activity && <li>Aktivitetshistorik</li>}
                <li>Sammanfattning</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={generating}>
              Avbryt
            </Button>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <>Genererar...</>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Generera PDF
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
