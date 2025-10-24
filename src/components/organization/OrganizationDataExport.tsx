import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Download, Database, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";

interface OrganizationDataExportProps {
  organizationId: string;
}

interface Property {
  id: string;
  name: string;
  address: string | null;
}

export function OrganizationDataExport({ organizationId }: OrganizationDataExportProps) {
  const [loading, setLoading] = useState(false);
  const [exportType, setExportType] = useState<"all" | "user" | "properties">("all");
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
      const { data, error } = await supabase.functions.invoke("export-organization-data", {
        body: {
          organizationId,
          exportType,
          userId: exportType === "user" ? selectedUserId : null,
          propertyIds: exportType === "properties" ? selectedPropertyIds : null,
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
              Välj export-typ
            </label>
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

          {exportType === "properties" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Välj fastigheter</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={toggleAllProperties}
                >
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
