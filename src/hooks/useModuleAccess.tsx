import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export type ModuleName =
  | "dashboard"
  | "properties"
  | "components"
  | "work-orders"
  | "projects"
  | "users"
  | "organization"
  | "ai-chat";

const ALL_MODULES: ModuleName[] = [
  "dashboard",
  "properties",
  "components",
  "work-orders",
  "projects",
  "users",
  "organization",
  "ai-chat",
];

/** Modules granted by default when no explicit user_module_access rows exist */
const DEFAULT_MODULES: ModuleName[] = [
  "dashboard",
  "properties",
  "components",
  "work-orders",
  "projects",
  "organization",
  "ai-chat",
  // "users" intentionally excluded from default — admin-managed
];

export const useModuleAccess = () => {
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: moduleAccess, isLoading: moduleLoading } = useQuery({
    queryKey: ["module-access", session?.user?.id],
    queryFn: async (): Promise<ModuleName[]> => {
      // Fail closed: no session → no modules
      if (!session?.user?.id) {
        return [];
      }

      // Prefer SECURITY DEFINER RPC so RLS never hides system roles
      let systemRoleList: string[] = [];
      const { data: rpcRoles, error: rpcErr } = await supabase.rpc(
        "get_my_roles" as never,
      );
      if (!rpcErr && Array.isArray(rpcRoles)) {
        systemRoleList = rpcRoles as string[];
      } else {
        const { data: systemRoles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id);
        systemRoleList = (systemRoles ?? []).map((r) => r.role as string);
      }

      const isSystemAdmin = systemRoleList.some(
        (r) => r === "admin" || r === "founder",
      );

      if (isSystemAdmin) {
        return [...ALL_MODULES];
      }

      const { data, error } = await supabase
        .from("user_module_access")
        .select("module_name, is_enabled")
        .eq("user_id", session.user.id);

      if (error) throw error;

      if (!data || data.length === 0) {
        return [...DEFAULT_MODULES];
      }

      const accessMap = new Map<string, boolean>();
      data.forEach((item) => {
        accessMap.set(item.module_name, item.is_enabled);
      });

      return ALL_MODULES.filter((moduleName) => {
        if (accessMap.has(moduleName)) {
          return accessMap.get(moduleName) === true;
        }
        // Unknown module with partial rules: only allow if in default set
        return DEFAULT_MODULES.includes(moduleName);
      });
    },
    enabled: !sessionLoading && !!session?.user?.id,
  });

  const isLoading = sessionLoading || (!!session?.user?.id && moduleLoading);

  const hasModuleAccess = (moduleName: ModuleName): boolean => {
    // Fail closed while loading — prevent flash of unauthorized UI
    if (isLoading) {
      logger.debug(`hasModuleAccess(${moduleName}): loading → deny`);
      return false;
    }
    if (!moduleAccess) {
      logger.debug(`hasModuleAccess(${moduleName}): no data → deny`);
      return false;
    }
    return moduleAccess.includes(moduleName);
  };

  return {
    moduleAccess: moduleAccess || [],
    isLoading,
    hasModuleAccess,
  };
};
