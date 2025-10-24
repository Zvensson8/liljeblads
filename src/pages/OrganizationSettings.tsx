import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Building } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { OrganizationInfo } from "@/components/organization/OrganizationInfo";
import { OrganizationMembers } from "@/components/organization/OrganizationMembers";
import { OrganizationInvitations } from "@/components/organization/OrganizationInvitations";
import { OrganizationSubscription } from "@/components/organization/OrganizationSubscription";
import { OrganizationBranding } from "@/components/organization/OrganizationBranding";
import { OrganizationDataExport } from "@/components/organization/OrganizationDataExport";
import { PropertyInfoCategoryManager } from "@/components/property-info/PropertyInfoCategoryManager";
import { NotificationSettings } from "@/components/organization/NotificationSettings";

interface Organization {
  id: string;
  name: string;
  max_properties: number;
  max_users: number;
  subscription_tier: string;
  logo_url: string | null;
  primary_color: string | null;
  created_at: string;
}

interface OrganizationMember {
  id: string;
  role: string;
  joined_at: string;
  user_id: string;
}

export default function OrganizationSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [userRole, setUserRole] = useState<string>("member");
  const [stats, setStats] = useState({
    propertyCount: 0,
    memberCount: 0,
    componentCount: 0,
  });

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    fetchOrganizationData();
  }, [user, navigate]);

  const fetchOrganizationData = async () => {
    try {
      setLoading(true);

      // Hämta användarens organisations-medlemskap
      const { data: memberData, error: memberError } = await supabase
        .from("organization_members")
        .select("*, organization:organizations(*)")
        .eq("user_id", user?.id)
        .single();

      if (memberError) throw memberError;

      if (!memberData?.organization) {
        toast.error("Du är inte medlem i någon organisation");
        navigate("/");
        return;
      }

      setOrganization(memberData.organization as any);
      setUserRole(memberData.role);

      // Hämta statistik
      const [propertiesResult, membersResult, componentsResult] = await Promise.all([
        supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", memberData.organization.id),
        supabase
          .from("organization_members")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", memberData.organization.id),
        supabase
          .from("components")
          .select("id", { count: "exact", head: true })
          .eq("floor_id", memberData.organization.id),
      ]);

      setStats({
        propertyCount: propertiesResult.count || 0,
        memberCount: membersResult.count || 0,
        componentCount: componentsResult.count || 0,
      });
    } catch (error: any) {
      console.error("Error fetching organization:", error);
      toast.error("Kunde inte hämta organisationsdata");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <div className="flex-1 p-8">
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                <p className="mt-4 text-muted-foreground">Laddar organisation...</p>
              </div>
            </div>
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (!organization) return null;

  const isAdmin = userRole === "owner" || userRole === "admin";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1">
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">Organisation</h1>
            </div>
          </header>

          <main className="flex-1 p-6">
            <div className="max-w-6xl mx-auto space-y-6">
              <div>
                <h2 className="text-2xl font-bold">{organization.name}</h2>
                <p className="text-muted-foreground">
                  Hantera din organisations inställningar och medlemmar
                </p>
              </div>

            {/* Statistik Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Fastigheter</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats.propertyCount} / {organization.max_properties}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {((stats.propertyCount / organization.max_properties) * 100).toFixed(0)}% använt
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Medlemmar</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats.memberCount} / {organization.max_users}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {((stats.memberCount / organization.max_users) * 100).toFixed(0)}% använt
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium">Komponenter</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.componentCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">Totalt antal</p>
                </CardContent>
              </Card>
            </div>

            {/* Tabs för olika inställningar */}
            <Tabs defaultValue="info" className="space-y-4">
              <TabsList>
                <TabsTrigger value="info">Information</TabsTrigger>
                <TabsTrigger value="members">Medlemmar</TabsTrigger>
                {isAdmin && <TabsTrigger value="invitations">Inbjudningar</TabsTrigger>}
                {isAdmin && <TabsTrigger value="subscription">Prenumeration</TabsTrigger>}
                {isAdmin && <TabsTrigger value="branding">Varumärke</TabsTrigger>}
                {isAdmin && <TabsTrigger value="property-info">Fastighetsinformation</TabsTrigger>}
                <TabsTrigger value="notifications">Rapporter</TabsTrigger>
                {isAdmin && <TabsTrigger value="export">Data Export</TabsTrigger>}
              </TabsList>

              <TabsContent value="info">
                <OrganizationInfo
                  organization={organization}
                  isAdmin={isAdmin}
                  onUpdate={fetchOrganizationData}
                />
              </TabsContent>

              <TabsContent value="members">
                <OrganizationMembers
                  organizationId={organization.id}
                  isAdmin={isAdmin}
                  currentUserId={user?.id || ""}
                />
              </TabsContent>

              {isAdmin && (
                <TabsContent value="invitations">
                  <OrganizationInvitations organizationId={organization.id} />
                </TabsContent>
              )}

              {isAdmin && (
                <TabsContent value="subscription">
                  <OrganizationSubscription
                    organization={organization}
                    stats={stats}
                    onUpdate={fetchOrganizationData}
                  />
                </TabsContent>
              )}

              {isAdmin && (
                <TabsContent value="branding">
                  <OrganizationBranding
                    organization={organization}
                    onUpdate={fetchOrganizationData}
                  />
                </TabsContent>
              )}

              {isAdmin && (
                <TabsContent value="property-info">
                  <PropertyInfoCategoryManager />
                </TabsContent>
              )}

              <TabsContent value="notifications">
                <NotificationSettings />
              </TabsContent>

              {isAdmin && (
                <TabsContent value="export">
                  <OrganizationDataExport organizationId={organization.id} />
                </TabsContent>
              )}
            </Tabs>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
