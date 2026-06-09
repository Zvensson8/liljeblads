import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { queryKeys } from '@/lib/queryKeys';

type AppRole = 'founder' | 'admin' | 'moderator' | 'user';

interface UserRoleRow {
  role: AppRole;
}

/**
 * Hook: fetch the current user's system roles from user_roles.
 */
export function useUserRoles() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.profiles.detail(user?.id ?? 'guest'),
    queryFn: async (): Promise<AppRole[]> => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .returns<UserRoleRow[]>();

      if (error) throw error;
      return data?.map((r) => r.role) ?? [];
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

/**
 * Convenience hook: true if the current user has the 'founder' role.
 */
export function useIsFounder() {
  const { data: roles = [], isLoading } = useUserRoles();
  return { isFounder: roles.includes('founder'), isLoading };
}

/**
 * Convenience hook: true if the current user has 'founder' or 'admin' role.
 */
export function useIsAdmin() {
  const { data: roles = [], isLoading } = useUserRoles();
  return {
    isAdmin: roles.includes('founder') || roles.includes('admin'),
    isLoading,
  };
}
