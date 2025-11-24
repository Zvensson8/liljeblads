import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Save } from "lucide-react";

interface OrganizationBrandingProps {
  organization: {
    id: string;
    logo_url: string | null;
    primary_color: string | null;
  };
  onUpdate: () => void;
}

export function OrganizationBranding({ organization, onUpdate }: OrganizationBrandingProps) {
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [primaryColor, setPrimaryColor] = useState(organization.primary_color || "#000000");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Välj en bildfil");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Bilden får max vara 2MB");
      return;
    }

    setLogoFile(file);
    
    try {
      setUploading(true);
      const fileExt = file.name.split(".").pop();
      const filePath = `${organization.id}/logo.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("organization-logos")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("organization-logos")
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("organizations")
        .update({ logo_url: publicUrl })
        .eq("id", organization.id);

      if (updateError) throw updateError;

      toast.success("Logotyp uppladdad");
      onUpdate();
    } catch (error: any) {
      console.error("Error uploading logo:", error);
      toast.error("Kunde inte ladda upp logotyp");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveColor = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from("organizations")
        .update({ primary_color: primaryColor })
        .eq("id", organization.id);

      if (error) throw error;

      toast.success("Primärfärg uppdaterad");
      onUpdate();
    } catch (error: any) {
      console.error("Error updating color:", error);
      toast.error("Kunde inte uppdatera färg");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Logotyp</CardTitle>
          <CardDescription>
            Ladda upp din organisations logotyp (max 2MB)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {organization.logo_url && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <img
                src={organization.logo_url}
                alt="Organization logo"
                className="max-h-32 object-contain"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <Input
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              disabled={uploading}
              className="hidden"
              id="logo-upload"
            />
            <Button 
              type="button" 
              disabled={uploading}
              onClick={() => document.getElementById('logo-upload')?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? "Laddar upp..." : "Välj logotyp"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Primärfärg</CardTitle>
          <CardDescription>
            Välj en primärfärg för din organisations varumärke
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="space-y-2 flex-1">
              <Label htmlFor="color">Färg</Label>
              <div className="flex gap-2">
                <input
                  type="color"
                  id="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-10 w-20 rounded border cursor-pointer"
                />
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#000000"
                  className="flex-1"
                />
              </div>
            </div>

            <div
              className="h-20 w-20 rounded-lg border-2 border-border"
              style={{ backgroundColor: primaryColor }}
            />
          </div>

          <Button onClick={handleSaveColor} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            Spara färg
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
