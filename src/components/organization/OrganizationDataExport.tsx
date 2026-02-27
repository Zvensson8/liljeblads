import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Download, Database, Loader2, FileText, FileSpreadsheet } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { createWorkbook, addJsonSheet, downloadWorkbook } from "@/lib/excelUtils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface OrganizationDataExportProps {
  organizationId: string;
}

interface Property {
  id: string;
  name: string;
  address: string | null;
}

type ExportFormat = "zip" | "xlsx" | "pdf";

const SECTION_LABELS: Record<string, string> = {
  organization: "Organisation",
  properties: "Fastigheter",
  floors: "Våningsplan",
  property_contacts: "Kontakter",
  property_notes: "Anteckningar",
  property_todos: "Att göra",
  components: "Komponenter",
  component_purchase_info: "Komponentinköp",
  maintenance_history: "Underhåll",
  projects: "Projekt",
  project_budget: "Projektbudget",
  project_costs: "Projektkostnader",
  project_checklist: "Projektchecklista",
  project_activity: "Projektaktivitet",
  work_orders: "Arbetsordrar",
  recurring_costs: "Återkommande kostnader",
  drift_categories: "Driftkategorier",
  drift_tasks: "Driftuppgifter",
  drift_task_components: "Driftkomponenter",
  component_documents: "Komponentdokument",
  property_documents: "Fastighetsdokument",
  project_documents: "Projektdokument",
};

function downloadZip(zipData: string, filename: string) {
  const binaryString = atob(zipData);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: "application/zip" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.zip`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

async function exportRawAsXlsx(rawData: any, filename: string) {
  const wb = createWorkbook();
  const sections = Object.keys(SECTION_LABELS);

  for (const key of sections) {
    const data = rawData[key];
    if (!data) continue;
    const arr = Array.isArray(data) ? data : [data];
    if (arr.length === 0) continue;
    addJsonSheet(wb, SECTION_LABELS[key], arr);
  }

  await downloadWorkbook(wb, `${filename}.xlsx`);
}

function addPdfSection(doc: jsPDF, title: string, records: Record<string, any>[], startY: number): number {
  if (!records.length) return startY;
  const headers = Object.keys(records[0]).filter(h => !h.endsWith("_id") && h !== "id");
  if (headers.length === 0) return startY;

  const body = records.map(r =>
    headers.map(h => {
      const v = r[h];
      if (v === null || v === undefined) return "-";
      return String(v).substring(0, 50);
    })
  );

  if (startY > 250) {
    doc.addPage();
    startY = 20;
  }

  doc.setFontSize(13);
  doc.text(title, 14, startY);

  autoTable(doc, {
    startY: startY + 4,
    head: [headers.map(h => SECTION_LABELS[h] || h.replace(/_/g, " "))],
    body,
    theme: "grid",
    headStyles: { fillColor: [59, 130, 246], fontSize: 6 },
    styles: { fontSize: 5, cellPadding: 1.5 },
  });

  return (doc as any).lastAutoTable.finalY + 10;
}

function exportRawAsPdf(rawData: any, filename: string, orgName: string) {
  const doc = new jsPDF({ orientation: "landscape" });

  doc.setFontSize(18);
  doc.text(`Dataexport - ${orgName}`, 14, 20);
  doc.setFontSize(10);
  doc.text(`Genererad: ${format(new Date(), "PPP", { locale: sv })}`, 14, 28);

  let y = 38;
  const sections = Object.keys(SECTION_LABELS);

  for (const key of sections) {
    const data = rawData[key];
    if (!data) continue;
    const arr = Array.isArray(data) ? data : [data];
    if (arr.length === 0) continue;
    y = addPdfSection(doc, SECTION_LABELS[key], arr, y);
  }

  doc.save(`${filename}.pdf`);
}

export function OrganizationDataExport({ organizationId }: OrganizationDataExportProps) {
  const [loading, setLoading] = useState(false);
  const [exportType, setExportType] = useState<"all" | "user" | "properties">("all");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("zip");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingProperties, setLoadingProperties] = useState(false);

  useEffect(() => {
    fetchMembers();
    fetchProperties();
  }, [organizationId]);

  const fetchMembers = async () => {
    setLoadingMembers(true);
    try {
      const { data, error } = await supabase
        .from("organization_members")
        .select("user_id, profiles(id, email, full_name)")
        .eq("organization_id", organizationId);
      if (error) throw error;
      setMembers(data || []);
    } catch (error: any) {
      console.error("Error fetching members:", error);
      toast.error("Kunde inte hämta medlemmar");
    } finally {
      setLoadingMembers(false);
    }
  };

  const fetchProperties = async () => {
    setLoadingProperties(true);
    try {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, address")
        .eq("organization_id", organizationId)
        .order("name");
      if (error) throw error;
      setProperties(data || []);
    } catch (error: any) {
      console.error("Error fetching properties:", error);
      toast.error("Kunde inte hämta fastigheter");
    } finally {
      setLoadingProperties(false);
    }
  };

  const toggleProperty = (propertyId: string) => {
    setSelectedPropertyIds(prev =>
      prev.includes(propertyId)
        ? prev.filter(id => id !== propertyId)
        : [...prev, propertyId]
    );
  };

  const toggleAllProperties = () => {
    if (selectedPropertyIds.length === properties.length) {
      setSelectedPropertyIds([]);
    } else {
      setSelectedPropertyIds(properties.map(p => p.id));
    }
  };

  const handleExport = async () => {
    if (exportType === "properties" && selectedPropertyIds.length === 0) {
      toast.error("Välj minst en fastighet att exportera");
      return;
    }
    if (exportType === "user" && !selectedUserId) {
      toast.error("Välj en användare att exportera");
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Du måste vara inloggad för att exportera data");
        return;
      }

      const { data, error } = await supabase.functions.invoke("export-organization-data", {
        body: {
          organizationId,
          exportType,
          userId: exportType === "user" ? selectedUserId : null,
          propertyIds: exportType === "properties" ? selectedPropertyIds : null,
        },
      });

      if (error) throw error;

      const baseFilename = data.filename;
      const orgName = data.rawData?.organization?.name || "Organisation";

      if (exportFormat === "zip") {
        downloadZip(data.zipData, baseFilename);
      } else if (exportFormat === "xlsx") {
        await exportRawAsXlsx(data.rawData, baseFilename);
      } else {
        exportRawAsPdf(data.rawData, baseFilename, orgName);
      }

      toast.success(
        `Data exporterad som ${exportFormat.toUpperCase()}! Totalt ${data.summary.properties_count} fastigheter, ${data.summary.components_count} komponenter, ${data.summary.projects_count} projekt`
      );
    } catch (error: any) {
      console.error("Export error:", error);
      toast.error("Kunde inte exportera data: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatIcon = {
    zip: <Download className="h-4 w-4 mr-2" />,
    xlsx: <FileSpreadsheet className="h-4 w-4 mr-2" />,
    pdf: <FileText className="h-4 w-4 mr-2" />,
  };

  const formatLabel = {
    zip: "ZIP (textfiler)",
    xlsx: "Excel (.xlsx)",
    pdf: "PDF",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Exportera organisationsdata
        </CardTitle>
        <CardDescription>
          Exportera all data för organisationen eller en specifik användare.
          Välj format: ZIP med textfiler, Excel eller PDF.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertDescription>
            Exporten inkluderar: Fastigheter, våningsplan, komponenter, projekt, arbetsordrar,
            kostnader, drift/underhåll, dokument och all annan relaterad data.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Export-typ</label>
              <Select value={exportType} onValueChange={(value: any) => setExportType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All organisationsdata</SelectItem>
                  <SelectItem value="properties">Specifika fastigheter</SelectItem>
                  <SelectItem value="user">Specifik användare</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Filformat</label>
              <Select value={exportFormat} onValueChange={(value: any) => setExportFormat(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zip">ZIP (textfiler)</SelectItem>
                  <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {exportType === "properties" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Välj fastigheter</Label>
                <Button type="button" variant="ghost" size="sm" onClick={toggleAllProperties}>
                  {selectedPropertyIds.length === properties.length ? "Avmarkera alla" : "Markera alla"}
                </Button>
              </div>
              {loadingProperties ? (
                <div className="text-sm text-muted-foreground">Laddar fastigheter...</div>
              ) : (
                <div className="max-h-64 overflow-y-auto border rounded-lg p-3 space-y-2">
                  {properties.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Inga fastigheter hittades</p>
                  ) : (
                    properties.map((property) => (
                      <div key={property.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={property.id}
                          checked={selectedPropertyIds.includes(property.id)}
                          onCheckedChange={() => toggleProperty(property.id)}
                        />
                        <label
                          htmlFor={property.id}
                          className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                        >
                          {property.name}
                          {property.address && (
                            <span className="text-muted-foreground ml-2">({property.address})</span>
                          )}
                        </label>
                      </div>
                    ))
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {selectedPropertyIds.length} fastighet(er) valda
              </p>
            </div>
          )}

          {exportType === "user" && (
            <div>
              <Label className="text-sm font-medium mb-2 block">Välj användare</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj användare" />
                </SelectTrigger>
                <SelectContent>
                  {loadingMembers ? (
                    <SelectItem value="loading" disabled>
                      Laddar användare...
                    </SelectItem>
                  ) : (
                    members.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.profiles?.full_name || member.profiles?.email || member.user_id}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                Exporterar endast data kopplad till den valda användaren
              </p>
            </div>
          )}

          <Button onClick={handleExport} disabled={loading} className="w-full" size="lg">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exporterar data...
              </>
            ) : (
              <>
                {formatIcon[exportFormat]}
                Exportera som {formatLabel[exportFormat]}
              </>
            )}
          </Button>

          <div className="p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2">Vad som inkluderas:</h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              {exportType === "all" && (
                <>
                  <li>• Alla fastigheter och våningsplan</li>
                  <li>• Alla komponenter med dokumentation</li>
                  <li>• Alla projekt med kostnader och dokument</li>
                  <li>• Alla arbetsordrar med filer</li>
                  <li>• Drift- och underhållsdata</li>
                  <li>• Återkommande kostnader</li>
                  <li>• Organisationsinformation</li>
                </>
              )}
              {exportType === "properties" && (
                <>
                  <li>• Valda fastigheter och deras våningsplan</li>
                  <li>• Komponenter i valda fastigheter</li>
                  <li>• Projekt kopplade till valda fastigheter</li>
                  <li>• Arbetsordrar för valda fastigheter</li>
                  <li>• Drift- och underhållsdata</li>
                  <li>• Dokument och kontakter</li>
                </>
              )}
              {exportType === "user" && (
                <>
                  <li>• Användarens fastigheter</li>
                  <li>• Komponenter och projekt</li>
                  <li>• Arbetsordrar och dokument</li>
                  <li>• All annan användarrelaterad data</li>
                </>
              )}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
