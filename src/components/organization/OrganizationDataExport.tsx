import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Download, Database, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface OrganizationDataExportProps {
  organizationId: string;
}

export function OrganizationDataExport({ organizationId }: OrganizationDataExportProps) {
  const [loading, setLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [members, setMembers] = useState<any[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    fetchMembers();
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

  const handleExport = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-organization-data", {
        body: {
          organizationId,
          userId: selectedUserId === "all" ? null : selectedUserId,
        },
      });

      if (error) throw error;

      // Download the JSON file directly
      const jsonString = JSON.stringify(data.data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success(`Data exporterad! Totalt ${data.data.summary.properties_count} fastigheter, ${data.data.summary.components_count} komponenter, ${data.data.summary.projects_count} projekt`);
    } catch (error: any) {
      console.error("Export error:", error);
      toast.error("Kunde inte exportera data: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Exportera organisationsdata
        </CardTitle>
        <CardDescription>
          Exportera all data för organisationen eller en specifik användare till en ZIP-fil.
          Använd detta för att ta ut er data eller för backup-syfte.
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
          <div>
            <label className="text-sm font-medium mb-2 block">
              Välj vad som ska exporteras
            </label>
            <Select
              value={selectedUserId}
              onValueChange={setSelectedUserId}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All organisationsdata</SelectItem>
                {loadingMembers && (
                  <SelectItem value="loading" disabled>
                    Laddar användare...
                  </SelectItem>
                )}
                {!loadingMembers && members.length > 0 && (
                  <>
                    {members.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.profiles?.full_name || member.profiles?.email || member.user_id}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-2">
              {selectedUserId === "all"
                ? "Exporterar all data i organisationen"
                : "Exporterar endast data kopplad till den valda användaren"}
            </p>
          </div>

          <Button
            onClick={handleExport}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exporterar data...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Exportera till ZIP
              </>
            )}
          </Button>

          {selectedUserId === "all" && (
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Vad som inkluderas:</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Alla fastigheter och våningsplan</li>
                <li>• Alla komponenter med dokumentation</li>
                <li>• Alla projekt med kostnader och dokument</li>
                <li>• Alla arbetsordrar med filer</li>
                <li>• Drift- och underhållsdata</li>
                <li>• Återkommande kostnader</li>
                <li>• Organisationsinformation</li>
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
