import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { storageService } from "@/services/supabase";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [primaryColor, setPrimaryColor] = useState(organization.primary_color || "#000000");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.log("No file selected");
      return;
    }

    console.log("File selected:", file.name, file.type, file.size);

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
      console.log("Starting upload...");
      
      const fileExt = file.name.split(".").pop();
      const timestamp = Date.now();
      const filePath = `${organization.id}/logo-${timestamp}.${fileExt}`;

      console.log("Uploading to:", filePath);

      await storageService.upload("organization-logos", filePath, file, { upsert: true });

      const publicUrl = storageService.getPublicUrl("organization-logos", filePath);

      console.log("Public URL:", publicUrl);
      console.log("Updating organization record...");


      const { error: updateError } = await supabase
        .from("organizations")
        .update({ logo_url: publicUrl })
        .eq("id", organization.id);

      if (updateError) {
        console.error("Update error:", updateError);
        throw updateError;
      }

      console.log("Organization updated successfully");
      toast.success("Logotyp uppladdad");
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              style={{ display: 'none' }}
            />
            <Button 
              type="button" 
              disabled={uploading}
              onClick={(e) => {
                e.preventDefault();
                console.log("Button clicked");
                fileInputRef.current?.click();
              }}
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
