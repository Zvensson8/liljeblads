import React from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useUserRoles } from "@/hooks/useUserRoles";

type AppRole = "founder" | "admin" | "moderator" | "user";

interface RequireRoleProps {
  children: React.ReactNode;
  /** Any of these roles grants access */
  roles: AppRole[];
  /** Where to send unauthorized users */
  fallbackTo?: string;
}

/**
 * Route guard for system roles (user_roles). Fail-closed while loading.
 */
export function RequireRole({
  children,
  roles,
  fallbackTo = "/dashboard",
}: RequireRoleProps) {
  const { data: userRoles = [], isLoading, isError } = useUserRoles();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !roles.some((r) => userRoles.includes(r))) {
    return <Navigate to={fallbackTo} replace />;
  }

  return <>{children}</>;
}

export function RequireFounder({ children }: { children: React.ReactNode }) {
  return <RequireRole roles={["founder"]}>{children}</RequireRole>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  return <RequireRole roles={["founder", "admin"]}>{children}</RequireRole>;
}
