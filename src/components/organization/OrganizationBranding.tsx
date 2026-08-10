import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { storageService } from "@/services/supabase";
import { getErrorMessage } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Save, Trash2 } from "lucide-react";

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
  const [primaryColor, setPrimaryColor] = useState(organization.primary_color || "#000000");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(organization.logo_url);

  useEffect(() => {
    setPreviewUrl(organization.logo_url);
    setPrimaryColor(organization.primary_color || "#000000");
  }, [organization.logo_url, organization.primary_color]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Always clear so the same file can be re-selected after a failure
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Välj en bildfil (PNG, JPG, SVG, WebP …)");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("Bilden får max vara 2MB");
      return;
    }

    if (!organization.id) {
      toast.error("Saknar organisations-id – ladda om sidan och försök igen");
      return;
    }

    try {
      setUploading(true);
      const rawExt = file.name.split(".").pop()?.toLowerCase() || "png";
      const fileExt = rawExt.replace(/[^a-z0-9]/g, "") || "png";
      const timestamp = Date.now();
      // Path must start with org UUID — storage RLS uses first folder segment
      const filePath = `${organization.id}/logo-${timestamp}.${fileExt}`;

      await storageService.upload("organization-logos", filePath, file, {
        upsert: false,
        contentType: file.type || `image/${fileExt}`,
        cacheControl: "3600",
      });

      const publicUrl = storageService.getPublicUrl("organization-logos", filePath);
      // Cache-bust so the new logo shows immediately
      const publicUrlWithBust = `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}t=${timestamp}`;

      const { error: updateError } = await supabase
        .from("organizations")
        .update({ logo_url: publicUrl })
        .eq("id", organization.id);

      if (updateError) {
        console.error("Update error:", updateError);
        // Best-effort cleanup of orphaned object
        try {
          await storageService.remove("organization-logos", [filePath]);
        } catch {
          /* ignore */
        }
        throw updateError;
      }

      setPreviewUrl(publicUrlWithBust);
      toast.success("Logotyp uppladdad");
      onUpdate();
    } catch (error: unknown) {
      console.error("Error uploading logo:", error);
      const msg = getErrorMessage(error);
      toast.error(msg ? `Kunde inte ladda upp logotyp: ${msg}` : "Kunde inte ladda upp logotyp");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!organization.logo_url) return;
    try {
      setUploading(true);
      const { error } = await supabase
        .from("organizations")
        .update({ logo_url: null })
        .eq("id", organization.id);
      if (error) throw error;
      setPreviewUrl(null);
      toast.success("Logotyp borttagen");
      onUpdate();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || "Kunde inte ta bort logotyp");
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
    } catch (error: unknown) {
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
          {previewUrl && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <img
                src={previewUrl}
                alt="Organization logo"
                className="max-h-32 object-contain"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml,image/gif"
              onChange={handleLogoUpload}
              className="sr-only"
              id="org-logo-upload"
            />
            <Button
              type="button"
              disabled={uploading}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? "Laddar upp..." : previewUrl ? "Byt logotyp" : "Välj logotyp"}
            </Button>
            {previewUrl && (
              <Button
                type="button"
                variant="outline"
                disabled={uploading}
                onClick={handleRemoveLogo}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Ta bort
              </Button>
            )}
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
