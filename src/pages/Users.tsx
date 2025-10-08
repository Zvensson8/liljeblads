import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Mail, Calendar, Loader2, Building2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  approved: boolean;
  created_at: string;
}

interface Property {
  id: string;
  name: string;
}

interface PropertyAssignment {
  property_id: string;
  user_id: string;
}

export default function Users() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyDialogOpen, setPropertyDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [userProperties, setUserProperties] = useState<string[]>([]);
  const [savingProperties, setSavingProperties] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchProfiles();
      fetchProperties();
    }
  }, [user]);

  const fetchProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      console.error("Error fetching profiles:", error);
      toast({
        title: "Fel",
        description: "Kunde inte hämta användare",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchProperties = async () => {
    try {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name")
        .order("name");

      if (error) throw error;
      setProperties(data || []);
    } catch (error) {
      console.error("Error fetching properties:", error);
    }
  };

  const fetchUserProperties = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("property_users")
        .select("property_id")
        .eq("user_id", userId);

      if (error) throw error;
      setUserProperties(data?.map(p => p.property_id) || []);
    } catch (error) {
      console.error("Error fetching user properties:", error);
    }
  };

  const handleOpenPropertyDialog = async (profile: Profile) => {
    setSelectedUser(profile);
    await fetchUserProperties(profile.id);
    setPropertyDialogOpen(true);
  };

  const handleToggleProperty = (propertyId: string) => {
    setUserProperties(prev =>
      prev.includes(propertyId)
        ? prev.filter(id => id !== propertyId)
        : [...prev, propertyId]
    );
  };

  const handleSavePropertyAssignments = async () => {
    if (!selectedUser) return;

    setSavingProperties(true);
    try {
      // Fetch current assignments
      const { data: currentAssignments, error: fetchError } = await supabase
        .from("property_users")
        .select("property_id")
        .eq("user_id", selectedUser.id);

      if (fetchError) throw fetchError;

      const currentPropertyIds = currentAssignments?.map(a => a.property_id) || [];
      
      // Determine which to add and which to remove
      const toAdd = userProperties.filter(id => !currentPropertyIds.includes(id));
      const toRemove = currentPropertyIds.filter(id => !userProperties.includes(id));

      // Add new assignments
      if (toAdd.length > 0) {
        const { error: insertError } = await supabase
          .from("property_users")
          .insert(toAdd.map(property_id => ({
            user_id: selectedUser.id,
            property_id
          })));

        if (insertError) throw insertError;
      }

      // Remove old assignments
      if (toRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from("property_users")
          .delete()
          .eq("user_id", selectedUser.id)
          .in("property_id", toRemove);

        if (deleteError) throw deleteError;
      }

      toast({
        title: "Fastigheter uppdaterade",
        description: `Fastighetstilldelningar för ${selectedUser.full_name || selectedUser.email} har uppdaterats`,
      });

      setPropertyDialogOpen(false);
      setSelectedUser(null);
    } catch (error) {
      console.error("Error saving property assignments:", error);
      toast({
        title: "Fel",
        description: "Kunde inte uppdatera fastighetstilldelningar",
        variant: "destructive",
      });
    } finally {
      setSavingProperties(false);
    }
  };

  const handleApprove = async (userId: string, approve: boolean) => {
    setProcessingId(userId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ approved: approve })
        .eq("id", userId);

      if (error) throw error;

      toast({
        title: approve ? "Användare godkänd" : "Godkännande återkallat",
        description: approve
          ? "Användaren kan nu logga in och använda systemet"
          : "Användaren har inte längre tillgång till systemet",
      });

      fetchProfiles();
    } catch (error) {
      console.error("Error updating profile:", error);
      toast({
        title: "Fel",
        description: "Kunde inte uppdatera användare",
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
    }
  };

  if (authLoading || loading) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <SidebarInset>
            <div className="flex items-center justify-center h-screen">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    );
  }

  const pendingUsers = profiles.filter((p) => !p.approved);
  const approvedUsers = profiles.filter((p) => p.approved);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <SidebarInset>
          <main className="flex-1 p-6 md:p-8 space-y-8">
            {/* Header */}
            <div>
              <h1 className="text-3xl font-bold mb-2">Användarhantering</h1>
              <p className="text-muted-foreground">
                Hantera och godkänn nya användare för systemet
              </p>
            </div>

            {/* Pending Users */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-2xl font-semibold">Väntande godkännande</h2>
                {pendingUsers.length > 0 && (
                  <Badge variant="destructive">{pendingUsers.length}</Badge>
                )}
              </div>

              {pendingUsers.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">
                      Inga användare väntar på godkännande
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {pendingUsers.map((profile) => (
                    <Card key={profile.id} className="border-destructive/50">
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {profile.full_name || "Ej angivet"}
                        </CardTitle>
                        <CardDescription className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            {profile.email}
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {new Date(profile.created_at).toLocaleDateString("sv-SE")}
                          </div>
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <Badge variant="outline">{profile.role}</Badge>
                        <div className="flex gap-2">
                          <Button
                            onClick={() => handleApprove(profile.id, true)}
                            disabled={processingId === profile.id}
                            className="flex-1"
                          >
                            {processingId === profile.id ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                            )}
                            Godkänn
                          </Button>
                          <Button
                            onClick={() => handleOpenPropertyDialog(profile)}
                            variant="outline"
                            size="icon"
                          >
                            <Building2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Approved Users */}
            <div>
              <h2 className="text-2xl font-semibold mb-4">Godkända användare</h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {approvedUsers.map((profile) => (
                  <Card key={profile.id}>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {profile.full_name || "Ej angivet"}
                        <Badge variant="default" className="ml-auto">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Godkänd
                        </Badge>
                      </CardTitle>
                      <CardDescription className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          {profile.email}
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {new Date(profile.created_at).toLocaleDateString("sv-SE")}
                        </div>
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Badge variant="outline">{profile.role}</Badge>
                      <div className="space-y-2">
                        <Button
                          onClick={() => handleOpenPropertyDialog(profile)}
                          variant="outline"
                          className="w-full"
                        >
                          <Building2 className="h-4 w-4 mr-2" />
                          Hantera fastigheter
                        </Button>
                        <Button
                          onClick={() => handleApprove(profile.id, false)}
                          disabled={processingId === profile.id}
                          variant="outline"
                          className="w-full"
                        >
                          {processingId === profile.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <XCircle className="h-4 w-4 mr-2" />
                          )}
                          Återkalla godkännande
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </main>
        </SidebarInset>
      </div>

      {/* Property Assignment Dialog */}
      <Dialog open={propertyDialogOpen} onOpenChange={setPropertyDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              Hantera fastigheter för {selectedUser?.full_name || selectedUser?.email}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {properties.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Inga fastigheter tillgängliga
              </p>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {properties.map((property) => (
                  <div
                    key={property.id}
                    className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      id={`property-${property.id}`}
                      checked={userProperties.includes(property.id)}
                      onCheckedChange={() => handleToggleProperty(property.id)}
                    />
                    <Label
                      htmlFor={`property-${property.id}`}
                      className="flex-1 cursor-pointer font-normal"
                    >
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {property.name}
                      </div>
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setPropertyDialogOpen(false)}
              disabled={savingProperties}
            >
              Avbryt
            </Button>
            <Button
              onClick={handleSavePropertyAssignments}
              disabled={savingProperties}
            >
              {savingProperties ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sparar...
                </>
              ) : (
                "Spara"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
