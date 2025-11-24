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
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      console.log("🔐 Session data:", data.session?.user?.id);
      return data.session;
    },
  });

  const { data: moduleAccess, isLoading } = useQuery({
    queryKey: ["module-access", session?.user?.id],
    queryFn: async () => {
      console.log("🚀 Module access query started");
      console.log("🔐 Session user ID:", session?.user?.id);
      
      if (!session?.user?.id) {
        console.log("❌ No user ID found, returning empty array");
        return [];
      }

      console.log("🔍 Checking module access for user:", session.user.id);

      // Check system roles INSIDE the query to avoid race conditions
      const { data: systemRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);

      console.log("👑 System roles:", systemRoles);
      console.log("👑 Roles error:", rolesError);

      const isSystemAdmin = systemRoles?.some(
        (r) => r.role === "admin" || r.role === "founder"
      ) || false;

      console.log("🔑 Is system admin:", isSystemAdmin);

      // If user is admin or founder, return all modules immediately
      if (isSystemAdmin) {
        const allModules = [
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
        console.log("✅ Admin/Founder - returning all modules:", allModules);
        return allModules;
      }

      const { data, error } = await supabase
        .from("user_module_access")
        .select("module_name, is_enabled")
        .eq("user_id", session.user.id);

      console.log("📋 Module access data from DB:", data);
      console.log("📋 Module access error:", error);

      if (error) {
        console.error("❌ Error fetching module access:", error);
        throw error;
      }

      // If no specific access rules exist, grant access to all modules by default
      // Admins can then explicitly restrict access for specific users
      if (!data || data.length === 0) {
        const defaultModules = [
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
        console.log("✅ No rules found - returning all modules:", defaultModules);
        return defaultModules;
      }

      // Filter only enabled modules
      const enabledModules = data
        .filter((item) => item.is_enabled)
        .map((item) => item.module_name as ModuleName);
      
      console.log("📊 Enabled modules after filtering:", enabledModules);
      console.log("📊 Total modules in DB:", data.length);
      console.log("📊 Enabled count:", enabledModules.length);
      
      // If all modules are disabled, return empty array (user has no access)
      return enabledModules;
    },
    // Remove the enabled check - let the query run and handle empty session inside
    enabled: true,
  });

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
