/**
 * Admin-facing hooks for managing a specific user's module access rules.
 *
 * Distinct from `useModuleAccess`, which reads the *current* user's
 * access for routing/visibility decisions.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { queryKeys } from '@/lib/queryKeys';

export interface UserModuleAccessRow {
  id: string;
  user_id: string;
  module_name: string;
  is_enabled: boolean;
}

export function useUserModuleAccess(userId: string | undefined) {
  const { session } = useAuth();
  return useQuery<UserModuleAccessRow[]>({
    queryKey: queryKeys.userModuleAccess.byUser(userId ?? ''),
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('user_module_access')
        .select('*')
        .eq('user_id', userId);
      if (error) throw error;
      return (data ?? []) as UserModuleAccessRow[];
    },
    enabled: !!userId && !!session,
    staleTime: 1000 * 60 * 2,
  });
}

export function useUpsertUserModuleAccess() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: {
      userId: string;
      moduleName: string;
      isEnabled: boolean;
    }) => {
      const { error } = await supabase.from('user_module_access').upsert(
        {
          user_id: input.userId,
          module_name: input.moduleName,
          is_enabled: input.isEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,module_name' },
      );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.userModuleAccess.byUser(vars.userId),
      });
      toast({ title: 'Modulåtkomst uppdaterad' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte uppdatera modulåtkomst',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Members of a given organization, joined with their profile info.
 * Used by admin screens that need to pick a user from the org roster.
 */
export interface OrganizationMemberProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

export function useOrganizationMemberProfiles(
  organizationId: string | undefined,
) {
  const { session } = useAuth();
  return useQuery<OrganizationMemberProfile[]>({
    queryKey: queryKeys.organizationMembers.byOrganization(
      organizationId ?? '',
    ),
    queryFn: async () => {
      if (!organizationId) return [];
      const { data: members, error: membersError } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', organizationId);
      if (membersError) throw membersError;
      const userIds = (members ?? []).map((m) => m.user_id);
      if (userIds.length === 0) return [];
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      if (profilesError) throw profilesError;
      return (profiles ?? []) as OrganizationMemberProfile[];
    },
    enabled: !!organizationId && !!session,
    staleTime: 1000 * 60 * 2,
  });
}

/**
 * Returns the user_roles rows for a given user. Surface-level helper for
 * admin UI that needs to know if a target user is a system admin/founder.
 */
export function useUserRolesFor(userId: string | undefined) {
  const { session } = useAuth();
  return useQuery<{ role: string }[]>({
    queryKey: [...queryKeys.profiles.detail(userId ?? ''), 'roles'],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      if (error) throw error;
      return (data ?? []) as { role: string }[];
    },
    enabled: !!userId && !!session,
    staleTime: 1000 * 60 * 5,
  });
}
