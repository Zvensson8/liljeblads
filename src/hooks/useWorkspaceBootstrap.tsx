import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";

/**
 * Ensures the signed-in user has an organization workspace.
 * Calls SECURITY DEFINER RPC ensure_my_workspace (idempotent).
 */
export function useWorkspaceBootstrap() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [bootstrapping, setBootstrapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const ranForUser = useRef<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      ranForUser.current = null;
      setReady(true);
      setBootstrapping(false);
      setError(null);
      return;
    }

    if (ranForUser.current === user.id) {
      setReady(true);
      return;
    }

    let cancelled = false;

    (async () => {
      setBootstrapping(true);
      setError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc(
          "ensure_my_workspace" as never,
          { p_org_name: null } as never,
        );

        if (rpcError) throw rpcError;

        logger.debug("ensure_my_workspace", data);
        ranForUser.current = user.id;

        // Refresh role / module / org caches
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["user-roles"] }),
          queryClient.invalidateQueries({ queryKey: ["module-access"] }),
          queryClient.invalidateQueries({ queryKey: ["session"] }),
        ]);
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : "Kunde inte skapa arbetsyta";
        logger.error("Workspace bootstrap failed", e);
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) {
          setBootstrapping(false);
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, queryClient]);

  return {
    bootstrapping: authLoading || bootstrapping,
    ready,
    error,
  };
}
