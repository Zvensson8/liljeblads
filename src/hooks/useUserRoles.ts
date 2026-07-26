import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type AppRole = 'founder' | 'admin' | 'moderator' | 'user';

/**
 * Fetch the current user's system roles from user_roles.
 * Uses a dedicated query key (never share with profiles.detail — that caused cache bugs).
 * Prefers RPC get_my_roles() (SECURITY DEFINER); falls back to direct select.
 */
export function useUserRoles() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-roles', user?.id ?? 'guest'] as const,
    queryFn: async (): Promise<AppRole[]> => {
      if (!user?.id) return [];

      // 1) Preferred: SECURITY DEFINER RPC (bypasses RLS edge cases)
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'get_my_roles' as never,
      );

      if (!rpcError && Array.isArray(rpcData)) {
        return (rpcData as string[]).filter(Boolean) as AppRole[];
      }

      // 2) Fallback: direct table select (own-row policy)
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (error) {
        console.error('useUserRoles failed', rpcError ?? error);
        throw error;
      }

      return (data ?? []).map((r) => r.role as AppRole);
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 30,
    retry: 1,
  });
}

/** True if the current user has the 'founder' role. */
export function useIsFounder() {
  const { data: roles = [], isLoading, isError } = useUserRoles();
  return {
    isFounder: roles.includes('founder'),
    isLoading,
    isError,
    roles,
  };
}

/** True if the current user has 'founder' or 'admin' role. */
export function useIsAdmin() {
  const { data: roles = [], isLoading, isError } = useUserRoles();
  return {
    isAdmin: roles.includes('founder') || roles.includes('admin'),
    isLoading,
    isError,
    roles,
  };
}
