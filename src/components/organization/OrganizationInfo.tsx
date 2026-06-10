import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Pencil, Save, X } from "lucide-react";

interface OrganizationInfoProps {
  organization: {
    id: string;
    name: string;
    created_at: string;
  };
  isAdmin: boolean;
  onUpdate: () => void;
}

export function OrganizationInfo({ organization, isAdmin, onUpdate }: OrganizationInfoProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(organization.name);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from("organizations")
        .update({ name })
        .eq("id", organization.id);

      if (error) throw error;

      toast.success("Organisation uppdaterad");
      setEditing(false);
      onUpdate();
    } catch (error: unknown) {
      console.error("Error updating organization:", error);
      toast.error("Kunde inte uppdatera organisation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organisationsinformation</CardTitle>
        <CardDescription>Grundläggande information om din organisation</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Organisationsnamn</Label>
          {editing ? (
            <div className="flex gap-2">
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Organisationsnamn"
              />
              <Button onClick={handleSave} disabled={saving} size="icon">
                <Save className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => {
                  setEditing(false);
                  setName(organization.name);
                }}
                variant="outline"
                size="icon"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-lg font-medium">{organization.name}</p>
              {isAdmin && (
                <Button onClick={() => setEditing(true)} variant="ghost" size="sm">
                  <Pencil className="h-4 w-4 mr-2" />
                  Redigera
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Skapad</Label>
          <p className="text-sm text-muted-foreground">
            {new Date(organization.created_at).toLocaleDateString("sv-SE", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        <div className="space-y-2">
          <Label>Organisations-ID</Label>
          <p className="text-sm font-mono text-muted-foreground">{organization.id}</p>
        </div>
      </CardContent>
    </Card>
  );
}
