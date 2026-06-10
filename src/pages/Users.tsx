import { useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Mail, Calendar, Loader2, Building2, Settings, Users as UsersIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  approved: boolean;
  created_at: string;
  system_role?: string;
}

interface Property {
  id: string;
  name: string;
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
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [userProperties, setUserProperties] = useState<string[]>([]);
  const [savingProperties, setSavingProperties] = useState(false);
  const [isFounder, setIsFounder] = useState(false);
  const [editForm, setEditForm] = useState({
    approved: false,
    profile_role: "user",
    system_role: "user",
  });

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      checkFounderStatus();
      fetchProfiles();
      fetchProperties();
    }
  }, [user]);

  const checkFounderStatus = async () => {
    try {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user?.id)
        .eq("role", "founder")
        .maybeSingle();

      setIsFounder(!!data);
    } catch (error) {
      console.error("Error checking founder status:", error);
      setIsFounder(false);
    }
  };

  const fetchProfiles = async () => {
    try {
      // Hämta profiler med system_role från user_roles
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Hämta system roles separat
      const profilesWithRoles = await Promise.all(
        (data || []).map(async (profile) => {
          const { data: roleData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", profile.id)
            .maybeSingle();

          return {
            ...profile,
            system_role: (roleData?.role as string) || "user",
          };
        })
      );

      setProfiles(profilesWithRoles);
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

  const handleOpenEditDialog = (profile: Profile) => {
    setSelectedUser(profile);
    setEditForm({
      approved: profile.approved,
      profile_role: profile.role,
      system_role: profile.system_role || "user",
    });
    setEditDialogOpen(true);
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
      const { data: currentAssignments, error: fetchError } = await supabase
        .from("property_users")
        .select("property_id")
        .eq("user_id", selectedUser.id);

      if (fetchError) throw fetchError;

      const currentPropertyIds = currentAssignments?.map(a => a.property_id) || [];
      
      const toAdd = userProperties.filter(id => !currentPropertyIds.includes(id));
      const toRemove = currentPropertyIds.filter(id => !userProperties.includes(id));

      if (toAdd.length > 0) {
        const { error: insertError } = await supabase
          .from("property_users")
          .insert(toAdd.map(property_id => ({
            user_id: selectedUser.id,
            property_id
          })));

        if (insertError) throw insertError;
      }

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

  const handleSaveUserEdit = async () => {
    if (!selectedUser) return;

    // Endast founder kan ändra systemroller
    if (!isFounder) {
      toast({
        title: "Åtkomst nekad",
        description: "Endast founder kan ändra systemroller",
        variant: "destructive",
      });
      return;
    }

    setProcessingId(selectedUser.id);
    try {
      // Uppdatera profiles
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          approved: editForm.approved,
          role: editForm.profile_role as Database["public"]["Enums"]["user_role"],
        })
        .eq("id", selectedUser.id);

      if (profileError) throw profileError;

      // Kolla om user_roles post finns
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("*")
        .eq("user_id", selectedUser.id)
        .maybeSingle();

      if (existingRole) {
        // Uppdatera befintlig roll
        const { error: roleError } = await supabase
          .from("user_roles")
          .update({ role: editForm.system_role as any })
          .eq("user_id", selectedUser.id);

        if (roleError) throw roleError;
      } else {
        // Skapa ny roll
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({
            user_id: selectedUser.id,
            role: editForm.system_role as any,
          });

        if (roleError) throw roleError;
      }

      toast({
        title: "Användare uppdaterad",
        description: "Användarinställningar har sparats",
      });

      setEditDialogOpen(false);
      setSelectedUser(null);
      fetchProfiles();
    } catch (error: unknown) {
      console.error("Error updating user:", error);
      toast({
        title: "Fel",
        description: `Kunde inte uppdatera användare: ${getErrorMessage(error)}`,
        variant: "destructive",
      });
    } finally {
      setProcessingId(null);
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

  const getRoleBadgeVariant = (role: string) => {
    if (role === "founder") return "default";
    if (role === "admin") return "secondary";
    return "outline";
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      founder: "Founder",
      admin: "Admin",
      user: "Användare",
    };
    return labels[role] || role;
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
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 w-full">
          <header className="sticky top-0 z-10 flex h-14 md:h-16 items-center gap-2 md:gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
            <SidebarTrigger className="hidden md:flex" />
            <div className="flex items-center gap-2">
              <UsersIcon className="h-5 w-5 text-primary" />
              <h1 className="text-lg md:text-xl font-semibold">Användare</h1>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
            <div className="max-w-7xl mx-auto space-y-6">
              <div>
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
                    <Card 
                      key={profile.id} 
                      className="border-destructive/50 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => handleOpenEditDialog(profile)}
                    >
                      <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {profile.full_name || "Ej angivet"}
                        </CardTitle>
                        <div className="space-y-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            {profile.email}
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            {new Date(profile.created_at).toLocaleDateString("sv-SE")}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex gap-2">
                          <Badge variant="outline">{profile.role}</Badge>
                          <Badge variant={getRoleBadgeVariant(profile.system_role || "user")}>
                            {getRoleLabel(profile.system_role || "user")}
                          </Badge>
                        </div>
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
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
                  <Card 
                    key={profile.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => handleOpenEditDialog(profile)}
                  >
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {profile.full_name || "Ej angivet"}
                        <Badge variant="default" className="ml-auto">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Godkänd
                        </Badge>
                      </CardTitle>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          {profile.email}
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {new Date(profile.created_at).toLocaleDateString("sv-SE")}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="flex gap-2">
                        <Badge variant="outline">{profile.role}</Badge>
                        <Badge variant={getRoleBadgeVariant(profile.system_role || "user")}>
                          {getRoleLabel(profile.system_role || "user")}
                        </Badge>
                      </div>
                      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
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
            </div>
          </main>
        </SidebarInset>
      </div>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Redigera användare</DialogTitle>
            <DialogDescription>
              {selectedUser?.full_name || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label>Godkännandestatus</Label>
              <Select
                value={editForm.approved ? "approved" : "pending"}
                onValueChange={(value) => setEditForm({ ...editForm, approved: value === "approved" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      Godkänd
                    </div>
                  </SelectItem>
                  <SelectItem value="pending">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-orange-600" />
                      Väntande
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Profilroll (Deprecated)</Label>
              <Select
                value={editForm.profile_role}
                onValueChange={(value) => setEditForm({ ...editForm, profile_role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Användare</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Denna roll används inte längre. Använd systemroll istället.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Systemroll</Label>
              <Select
                value={editForm.system_role}
                onValueChange={(value) => setEditForm({ ...editForm, system_role: value })}
                disabled={!isFounder}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Användare</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="founder">Founder</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {isFounder 
                  ? "Founder har full tillgång till alla funktioner"
                  : "Endast founder kan ändra systemroller"}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Avbryt
            </Button>
            <Button onClick={handleSaveUserEdit} disabled={processingId === selectedUser?.id}>
              {processingId === selectedUser?.id ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Sparar...
                </>
              ) : (
                "Spara ändringar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
