import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";

const AVAILABLE_MODULES = [
  { name: "dashboard", label: "Dashboard" },
  { name: "properties", label: "Fastigheter" },
  { name: "components", label: "Komponenter" },
  { name: "work-orders", label: "Arbetsordrar" },
  { name: "operations", label: "Driftuppföljning" },
  { name: "projects", label: "Projekthantering" },
  { name: "recurring-costs", label: "Återkommande kostnader" },
  { name: "users", label: "Användare" },
  { name: "organization", label: "Organisation" },
];

export const OrganizationModuleAccess = () => {
  const { user } = useAuth();
  const { organization } = useOrganization();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // Fetch organization members
  const { data: members } = useQuery({
    queryKey: ["organization-members", organization?.id],
    queryFn: async () => {
      if (!organization?.id) return [];

      const { data: orgMembers } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", organization.id);

      if (!orgMembers) return [];

      const userIds = orgMembers.map((m) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      return profiles || [];
    },
    enabled: !!organization?.id,
  });

  // Check if selected user is admin or founder
  const { data: selectedUserRoles } = useQuery({
    queryKey: ["selected-user-roles", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", selectedUserId);

      return data || [];
    },
    enabled: !!selectedUserId,
  });

  const isSelectedUserSystemAdmin = selectedUserRoles?.some(
    (r) => r.role === "admin" || r.role === "founder"
  ) || false;

  // Fetch module access for selected user
  const { data: moduleAccess, isLoading: isLoadingAccess } = useQuery({
    queryKey: ["user-module-access", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];

      const { data } = await supabase
        .from("user_module_access")
        .select("*")
        .eq("user_id", selectedUserId);

      return data || [];
    },
    enabled: !!selectedUserId,
  });

  const updateModuleAccessMutation = useMutation({
    mutationFn: async ({
      userId,
      moduleName,
      isEnabled,
    }: {
      userId: string;
      moduleName: string;
      isEnabled: boolean;
    }) => {
      const { error } = await supabase.from("user_module_access").upsert(
        {
          user_id: userId,
          module_name: moduleName,
          is_enabled: isEnabled,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,module_name",
        }
      );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-module-access"] });
      toast.success("Modulåtkomst uppdaterad");
    },
    onError: (error) => {
      console.error("Error updating module access:", error);
      toast.error("Kunde inte uppdatera modulåtkomst");
    },
  });

  const handleModuleToggle = (moduleName: string, isEnabled: boolean) => {
    if (!selectedUserId) return;
    updateModuleAccessMutation.mutate({
      userId: selectedUserId,
      moduleName,
      isEnabled,
    });
  };

  const isModuleEnabled = (moduleName: string): boolean => {
    const access = moduleAccess?.find((a) => a.module_name === moduleName);
    return access ? access.is_enabled : true; // Default to enabled if no rule exists
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modulåtkomst</CardTitle>
        <CardDescription>
          Välj vilka moduler som ska vara synliga för olika användare
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label className="text-sm font-medium mb-2 block">Välj användare</label>
          <select
            className="w-full p-2 border rounded-md bg-background"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
          >
            <option value="">-- Välj användare --</option>
            {members?.map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name || member.email}
              </option>
            ))}
          </select>
        </div>

        {selectedUserId && (
          <div className="space-y-4">
            {isLoadingAccess ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : isSelectedUserSystemAdmin ? (
              <div className="p-4 border rounded-md bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  Denna användare är administratör/grundare och har alltid tillgång till alla moduler.
                  Modulåtkomst kan inte ändras för administratörer och grundare.
                </p>
              </div>
            ) : (
              <>
                <div className="text-sm font-medium mb-2">Tillgängliga moduler:</div>
                <div className="space-y-3">
                  {AVAILABLE_MODULES.map((module) => (
                    <div key={module.name} className="flex items-center space-x-2">
                      <Checkbox
                        id={`module-${module.name}`}
                        checked={isModuleEnabled(module.name)}
                        onCheckedChange={(checked) =>
                          handleModuleToggle(module.name, checked as boolean)
                        }
                      />
                      <label
                        htmlFor={`module-${module.name}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {module.label}
                      </label>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
