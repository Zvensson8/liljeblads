import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { Building } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { OrganizationInfo } from "@/components/organization/OrganizationInfo";
import { OrganizationMembers } from "@/components/organization/OrganizationMembers";
import { OrganizationBranding } from "@/components/organization/OrganizationBranding";
import { OrganizationInvitations } from "@/components/organization/OrganizationInvitations";
import { OrganizationAuditLogs } from "@/components/organization/OrganizationAuditLogs";
import { OrganizationDataExport } from "@/components/organization/OrganizationDataExport";
import { ProjectTemplates } from "@/components/organization/ProjectTemplates";
import { OrganizationModuleAccess } from "@/components/organization/OrganizationModuleAccess";
import { OrganizationApiKeys } from "@/components/organization/OrganizationApiKeys";
import { AgentRiskPolicySettings } from "@/components/organization/AgentRiskPolicySettings";
import { OrganizationUnitPrices } from "@/components/organization/OrganizationUnitPrices";
import { featureFlags } from "@/lib/featureFlags";


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
  const {
    organization: activeOrg,
    memberRole,
    loading: orgLoading,
    refetch: refetchActiveOrg,
  } = useOrganization();
  const [loading, setLoading] = useState(true);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [userRole, setUserRole] = useState<string>("member");
  const [isAdmin, setIsAdmin] = useState(false);
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
    if (orgLoading) return;
    void fetchOrganizationData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when active org changes
  }, [user, navigate, activeOrg?.id, orgLoading]);

  const fetchOrganizationData = async () => {
    try {
      setLoading(true);

      if (!activeOrg?.id) {
        // Fall back: use list already loaded by useOrganization
        toast.error("Du är inte medlem i någon organisation");
        navigate("/");
        return;
      }

      // Membership-checked RPC (avoids brittle RLS on organizations_public)
      const { data: orgJson, error: orgError } = await supabase.rpc(
        "get_organization_for_settings" as never,
        { p_organization_id: activeOrg.id } as never,
      );

      if (orgError) throw orgError;

      const orgRow = orgJson as {
        id: string;
        name: string;
        max_properties: number;
        max_users: number;
        subscription_tier: string;
        logo_url: string | null;
        primary_color: string | null;
        created_at: string;
        member_role?: string;
      } | null;

      if (!orgRow?.id) {
        // Soft fallback from active org list so UI still works
        setOrganization({
          id: activeOrg.id,
          name: activeOrg.name,
          max_properties: 50,
          max_users: 10,
          subscription_tier: "small",
          logo_url: activeOrg.logo_url,
          primary_color: activeOrg.primary_color,
          created_at: new Date().toISOString(),
        });
        setUserRole(memberRole || "member");
      } else {
        setOrganization({
          id: orgRow.id,
          name: orgRow.name,
          max_properties: orgRow.max_properties,
          max_users: orgRow.max_users,
          subscription_tier: orgRow.subscription_tier,
          logo_url: orgRow.logo_url,
          primary_color: orgRow.primary_color,
          created_at: orgRow.created_at,
        });
        setUserRole(orgRow.member_role || memberRole || "member");
      }

      const roleForAdmin = orgRow?.member_role || memberRole || "member";

      const { data: systemRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user?.id);

      const isSystemAdmin =
        systemRoles?.some((r) => r.role === "admin" || r.role === "founder") ||
        false;

      setIsAdmin(
        roleForAdmin === "owner" ||
          roleForAdmin === "admin" ||
          roleForAdmin === "founder" ||
          isSystemAdmin,
      );

      const [propertiesResult, membersResult] = await Promise.all([
        supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", activeOrg.id),
        supabase
          .from("organization_members")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", activeOrg.id),
      ]);

      setStats({
        propertyCount: propertiesResult.count || 0,
        memberCount: membersResult.count || 0,
        componentCount: 0,
      });
    } catch (error: unknown) {
      console.error("Error fetching organization:", error);
      const message =
        error && typeof error === "object" && "message" in error
          ? String((error as { message: string }).message)
          : "Kunde inte hämta organisationsdata";

      // Last resort: still show settings from active membership list
      if (activeOrg?.id) {
        setOrganization({
          id: activeOrg.id,
          name: activeOrg.name,
          max_properties: 50,
          max_users: 10,
          subscription_tier: "small",
          logo_url: activeOrg.logo_url,
          primary_color: activeOrg.primary_color,
          created_at: new Date().toISOString(),
        });
        setUserRole(memberRole || "member");
        setIsAdmin(
          memberRole === "owner" ||
            memberRole === "admin" ||
            memberRole === "founder",
        );
        toast.error(`Delvis data: ${message}`);
      } else {
        toast.error(message || "Kunde inte hämta organisationsdata");
      }
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

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 w-full">
          <header className="sticky top-0 z-10 flex h-14 md:h-16 items-center gap-2 md:gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
            <SidebarTrigger className="hidden md:flex" />
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5 text-primary" />
              <h1 className="text-lg md:text-xl font-semibold">Organisation</h1>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
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
              <TabsList className="flex flex-wrap">
                <TabsTrigger value="info">Information</TabsTrigger>
                <TabsTrigger value="members">Medlemmar</TabsTrigger>
                {isAdmin && <TabsTrigger value="module-access">Modulåtkomst</TabsTrigger>}
                {isAdmin && <TabsTrigger value="integrations">Integrationer</TabsTrigger>}
                {isAdmin && <TabsTrigger value="agent">Agent & risk</TabsTrigger>}
                {isAdmin && <TabsTrigger value="unit-prices">Áprislista</TabsTrigger>}
                {isAdmin && <TabsTrigger value="invitations">Inbjudningar</TabsTrigger>}
                {isAdmin && <TabsTrigger value="branding">Varumärke</TabsTrigger>}
                {isAdmin && <TabsTrigger value="templates">Projektmallar</TabsTrigger>}
                {isAdmin && featureFlags.orgAdvancedAdminTabs && (
                  <TabsTrigger value="audit">Säkerhetslogg</TabsTrigger>
                )}
                {isAdmin && featureFlags.orgAdvancedAdminTabs && (
                  <TabsTrigger value="export">Data Export</TabsTrigger>
                )}
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
                <TabsContent value="module-access">
                  <OrganizationModuleAccess />
                </TabsContent>
              )}

              {isAdmin && (
                <TabsContent value="integrations">
                  <OrganizationApiKeys organizationId={organization.id} />
                </TabsContent>
              )}

              {isAdmin && (
                <TabsContent value="agent">
                  <AgentRiskPolicySettings
                    organizationId={organization.id}
                    canEdit={isAdmin}
                  />
                </TabsContent>
              )}

              {isAdmin && (
                <TabsContent value="unit-prices">
                  <OrganizationUnitPrices
                    organizationId={organization.id}
                    canEdit={isAdmin}
                  />
                </TabsContent>
              )}

              {isAdmin && (
                <TabsContent value="invitations">
                  <OrganizationInvitations organizationId={organization.id} />
                </TabsContent>
              )}

              {isAdmin && featureFlags.orgAdvancedAdminTabs && (
                <TabsContent value="audit">
                  <OrganizationAuditLogs organizationId={organization.id} />
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
                <TabsContent value="templates">
                  <ProjectTemplates organizationId={organization.id} />
                </TabsContent>
              )}

              {isAdmin && featureFlags.orgAdvancedAdminTabs && (
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
