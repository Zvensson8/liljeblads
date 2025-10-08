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
import { CheckCircle2, XCircle, Mail, Calendar, Loader2 } from "lucide-react";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  approved: boolean;
  created_at: string;
}

export default function Users() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchProfiles();
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
                        <Button
                          onClick={() => handleApprove(profile.id, true)}
                          disabled={processingId === profile.id}
                          className="w-full"
                        >
                          {processingId === profile.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                          )}
                          Godkänn användare
                        </Button>
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
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
