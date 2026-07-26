import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import {
  useUserModuleAccess,
  useUpsertUserModuleAccess,
  useOrganizationMemberProfiles,
  useUserRolesFor,
} from "@/hooks/useUserModuleAccess";

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
  { name: "ai-chat", label: "AI Assistent" },
];

export const OrganizationModuleAccess = () => {
  const { organization } = useOrganization();
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const { data: members } = useOrganizationMemberProfiles(organization?.id);
  const { data: selectedUserRoles } = useUserRolesFor(selectedUserId);
  const { data: moduleAccess, isLoading: isLoadingAccess } =
    useUserModuleAccess(selectedUserId);
  const upsertAccess = useUpsertUserModuleAccess();

  const isSelectedUserSystemAdmin =
    selectedUserRoles?.some((r) => r.role === "admin" || r.role === "founder") ||
    false;

  const handleModuleToggle = (moduleName: string, isEnabled: boolean) => {
    if (!selectedUserId) return;
    upsertAccess.mutate({ userId: selectedUserId, moduleName, isEnabled });
  };

  const isModuleEnabled = (moduleName: string): boolean => {
    const access = moduleAccess?.find((a) => a.module_name === moduleName);
    return access ? access.is_enabled : true;
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
