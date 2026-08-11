import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

export type ModuleName =
  | "dashboard"
  | "properties"
  | "components"
  | "work-orders"
  | "projects"
  | "ai-chat";

/** Modules exposed in product UI (org/users are founder routes, not modules) */
const ALL_MODULES: ModuleName[] = [
  "dashboard",
  "properties",
  "components",
  "work-orders",
  "projects",
  "ai-chat",
];

/**
 * Product policy (internal Liljeblads):
 * - Founder = system owner (settings, invite, integrations)
 * - Förvaltare = all product modules (no per-user module matrix)
 */
const DEFAULT_MODULES: ModuleName[] = [...ALL_MODULES];

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

  const isLoading = sessionLoading;

  const hasModuleAccess = (moduleName: ModuleName): boolean => {
    if (isLoading) {
      logger.debug(`hasModuleAccess(${moduleName}): loading → deny`);
      return false;
    }
    if (!session?.user?.id) {
      return false;
    }
    // All authenticated förvaltare/founders get full product modules
    return ALL_MODULES.includes(moduleName);
  };

  return {
    moduleAccess: session?.user?.id ? [...DEFAULT_MODULES] : [],
    isLoading,
    hasModuleAccess,
  };
};
