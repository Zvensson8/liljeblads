import { Building2, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { orgRoleLabel } from "@/lib/orgRoles";

interface OrganizationSwitcherProps {
  collapsed?: boolean;
}

/**
 * Sidebar control: list memberships and switch active organization.
 */
export function OrganizationSwitcher({ collapsed }: OrganizationSwitcherProps) {
  const {
    organization,
    memberships,
    memberRole,
    loading,
    isSwitching,
    setActiveOrganization,
  } = useOrganization();

  if (loading && memberships.length === 0) {
    return (
      <div className={cn("px-3 py-2", collapsed && "px-1")}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {!collapsed && <span>Laddar org…</span>}
        </div>
      </div>
    );
  }

  if (memberships.length === 0) {
    return null;
  }

  const currentName = organization?.name ?? "Organisation";
  const roleLabel = orgRoleLabel(memberRole);

  return (
    <div className={cn("px-2 py-2 border-b border-border", collapsed && "px-1")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size={collapsed ? "icon" : "sm"}
            className={cn(
              "w-full justify-between gap-2 font-normal",
              collapsed && "w-9 h-9 p-0",
            )}
            disabled={isSwitching}
            title={`${currentName} (${roleLabel})`}
          >
            {collapsed ? (
              <Building2 className="h-4 w-4" />
            ) : (
              <>
                <span className="flex items-center gap-2 min-w-0">
                  <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 text-left">
                    <span className="truncate block">{currentName}</span>
                    <span className="text-[10px] text-muted-foreground">{roleLabel}</span>
                  </span>
                </span>
                {isSwitching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                ) : (
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                )}
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64 z-50">
          <DropdownMenuLabel>Byt organisation</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {memberships.map((m) => {
            const active = m.organization_id === organization?.id;
            return (
              <DropdownMenuItem
                key={m.organization_id}
                disabled={active || isSwitching}
                onClick={() => {
                  if (!active) void setActiveOrganization(m.organization_id);
                }}
                className="flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{m.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {orgRoleLabel(m.member_role)}
                  </div>
                </div>
                {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
