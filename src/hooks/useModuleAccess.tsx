import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ModuleName = 
  | "dashboard"
  | "properties"
  | "components"
  | "work-orders"
  | "operations"
  | "projects"
  | "recurring-costs"
  | "users"
  | "organization";

export const useModuleAccess = () => {
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session;
    },
  });

  const { data: moduleAccess, isLoading } = useQuery({
    queryKey: ["module-access", session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) return [];

      const { data, error } = await supabase
        .from("user_module_access")
        .select("module_name, is_enabled")
        .eq("user_id", session.user.id);

      if (error) throw error;

      // If no specific access rules exist, all modules are enabled by default
      // This ensures admins, founders, and users without restrictions see everything
      if (!data || data.length === 0) {
        return [
          "dashboard",
          "properties",
          "components",
          "work-orders",
          "operations",
          "projects",
          "recurring-costs",
          "users",
          "organization",
        ] as ModuleName[];
      }

      return data
        .filter((item) => item.is_enabled)
        .map((item) => item.module_name as ModuleName);
    },
    enabled: !!session?.user?.id,
  });

  const hasModuleAccess = (moduleName: ModuleName): boolean => {
    if (isLoading || !moduleAccess) return true; // Default to true while loading
    return moduleAccess.includes(moduleName);
  };

  return {
    moduleAccess: moduleAccess || [],
    isLoading,
    hasModuleAccess,
  };
};
