/**
 * Hooks for `organization_invitations`.
 *
 * Lightweight TanStack Query wrappers — there's no shared service for
 * this entity because its semantics (insert via auth.uid, unique email)
 * are bespoke to the invitation flow.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { queryKeys } from '@/lib/queryKeys';

export interface OrganizationInvitation {
  id: string;
  organization_id: string;
  email: string;
  role: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  invited_by: string | null;
}

export function useOrganizationInvitations(organizationId: string | undefined) {
  const { session } = useAuth();
  return useQuery<OrganizationInvitation[]>({
    queryKey: queryKeys.organizationInvitations.byOrganization(
      organizationId ?? '',
    ),
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('organization_invitations')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OrganizationInvitation[];
    },
    enabled: !!organizationId && !!session,
    staleTime: 1000 * 60 * 2,
  });
}

export function useCreateOrganizationInvitation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: {
      organizationId: string;
      email: string;
      role: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('organization_invitations')
        .insert({
          organization_id: input.organizationId,
          email: input.email.toLowerCase(),
          role: input.role,
          invited_by: userData.user?.id,
        });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.organizationInvitations.byOrganization(
          vars.organizationId,
        ),
      });
      toast({ title: 'Inbjudan skickad' });
    },
    onError: (error: Error & { code?: string }) => {
      if (error.code === '23505') {
        toast({
          title: 'Denna e-postadress har redan bjudits in',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Kunde inte skicka inbjudan',
          description: error.message,
          variant: 'destructive',
        });
      }
    },
  });
}

export function useDeleteOrganizationInvitation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('organization_invitations')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.organizationInvitations.all,
      });
      toast({ title: 'Inbjudan borttagen' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte ta bort inbjudan',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
