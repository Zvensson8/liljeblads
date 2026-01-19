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
  | "organization"
  | "ai-chat";

export const useModuleAccess = () => {
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      console.log("🔐 Session data:", data.session?.user?.id);
      return data.session;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  const { data: moduleAccess, isLoading: moduleLoading } = useQuery({
    queryKey: ["module-access", session?.user?.id],
    queryFn: async () => {
      if (!session?.user?.id) {
        // If no session, return all modules to allow public access
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
          "ai-chat",
        ] as ModuleName[];
      }

      // Check system roles INSIDE the query to avoid race conditions
      const { data: systemRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);

      const isSystemAdmin = systemRoles?.some(
        (r) => r.role === "admin" || r.role === "founder"
      ) || false;

      // If user is admin or founder, return all modules immediately
      if (isSystemAdmin) {
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
          "ai-chat",
        ] as ModuleName[];
      }

      const { data, error } = await supabase
        .from("user_module_access")
        .select("module_name, is_enabled")
        .eq("user_id", session.user.id);

      if (error) throw error;

      // Default all modules
      const allModules: ModuleName[] = [
        "dashboard",
        "properties",
        "components",
        "work-orders",
        "operations",
        "projects",
        "recurring-costs",
        "users",
        "organization",
        "ai-chat",
      ];

      // If no specific access rules exist, grant access to all modules by default
      if (!data || data.length === 0) {
        return allModules;
      }

      // Build a map of explicit rules
      const accessMap = new Map<string, boolean>();
      data.forEach((item) => {
        accessMap.set(item.module_name, item.is_enabled);
      });

      // For each module: if there's an explicit rule, use it; otherwise allow by default
      const enabledModules = allModules.filter((moduleName) => {
        if (accessMap.has(moduleName)) {
          return accessMap.get(moduleName) === true;
        }
        // No explicit rule for this module - allow by default
        return true;
      });
      
      return enabledModules;
    },
    // Only run when session loading is complete
    enabled: !sessionLoading,
  });

  // Combined loading state
  const isLoading = sessionLoading || moduleLoading;

  const hasModuleAccess = (moduleName: ModuleName): boolean => {
    console.log(`🔍 hasModuleAccess called for: ${moduleName}`);
    console.log(`  - isLoading: ${isLoading}`);
    console.log(`  - moduleAccess:`, moduleAccess);
    console.log(`  - moduleAccess length:`, moduleAccess?.length);
    
    // Always allow access while loading to prevent flickering
    if (isLoading) {
      console.log(`  ⏳ Loading - allowing access`);
      return true;
    }
    // If no moduleAccess data loaded yet, allow access by default
    if (!moduleAccess) {
      console.log(`  ⚠️ No moduleAccess data - allowing access`);
      return true;
    }
    // If empty array, user has no module access
    if (moduleAccess.length === 0) {
      console.log(`  ❌ Empty array - denying access`);
      return false;
    }
    // Check if user has access to this specific module
    const hasAccess = moduleAccess.includes(moduleName);
    console.log(`  ${hasAccess ? '✅' : '❌'} Module ${moduleName}: ${hasAccess}`);
    return hasAccess;
  };

  return {
    moduleAccess: moduleAccess || [],
    isLoading,
    hasModuleAccess,
  };
};
