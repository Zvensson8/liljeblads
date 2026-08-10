import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';

export interface Organization {
  id: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
}

export interface OrganizationMembership {
  organization_id: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
  member_role: string;
  is_active: boolean;
}

/**
 * Active organization + membership list for the signed-in user.
 * Switching org invalidates org-scoped query caches.
 */
export function useOrganization() {
  const { user, session } = useAuth();
  const queryClient = useQueryClient();

  const membershipsQuery = useQuery({
    queryKey: queryKeys.myOrganizations.list(),
    queryFn: async (): Promise<OrganizationMembership[]> => {
      const { data, error } = await supabase.rpc('list_my_organizations' as never);
      if (error) throw error;
      return (data ?? []) as OrganizationMembership[];
    },
    enabled: !!session && !!user,
    staleTime: 1000 * 60,
  });

  const memberships = membershipsQuery.data ?? [];
  const activeMembership =
    memberships.find((m) => m.is_active) ?? memberships[0] ?? null;

  const organization: Organization | null = activeMembership
    ? {
        id: activeMembership.organization_id,
        name: activeMembership.name,
        logo_url: activeMembership.logo_url,
        primary_color: activeMembership.primary_color,
      }
    : null;

  const setActive = useMutation({
    mutationFn: async (organizationId: string) => {
      const { data, error } = await supabase.rpc(
        'set_active_organization' as never,
        { p_organization_id: organizationId } as never,
      );
      if (error) throw error;
      return data as { organization_id: string; member_role: string };
    },
    onSuccess: async () => {
      // Drop cached entity data so the next screens load the new org's rows
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.myOrganizations.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.properties.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.components.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.todos.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.driftTasks.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats.all }),
        queryClient.invalidateQueries({ queryKey: ['module-access'] }),
        queryClient.invalidateQueries({ queryKey: ['user-roles'] }),
        queryClient.invalidateQueries({ queryKey: ['session'] }),
      ]);
      toast.success('Organisation bytt');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Kunde inte byta organisation');
    },
  });

  const refetch = useCallback(async () => {
    await membershipsQuery.refetch();
  }, [membershipsQuery]);

  return {
    organization,
    memberships,
    memberRole: activeMembership?.member_role ?? null,
    loading: membershipsQuery.isLoading,
    isSwitching: setActive.isPending,
    setActiveOrganization: (orgId: string) => setActive.mutateAsync(orgId),
    refetch,
  };
}
