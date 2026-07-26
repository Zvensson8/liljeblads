/**
 * Hooks for `api_keys` (external integrations, e.g. Twin.so).
 *
 * The raw secret is never returned by `list` — only `key_prefix`. The
 * `create` mutation accepts a pre-hashed key so the caller can show the
 * plaintext exactly once before storage.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { queryKeys } from '@/lib/queryKeys';

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  permissions: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
}

export function useApiKeys(organizationId: string | undefined) {
  const { session } = useAuth();
  return useQuery<ApiKey[]>({
    queryKey: queryKeys.apiKeys.byOrganization(organizationId ?? ''),
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApiKey[];
    },
    enabled: !!organizationId && !!session,
    staleTime: 1000 * 60 * 2,
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: {
      organizationId: string;
      name: string;
      keyHash: string;
      keyPrefix: string;
      permissions: string[];
      createdBy?: string | null;
    }) => {
      const { error } = await supabase.from('api_keys').insert({
        organization_id: input.organizationId,
        name: input.name,
        key_hash: input.keyHash,
        key_prefix: input.keyPrefix,
        permissions: input.permissions,
        created_by: input.createdBy ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeys.byOrganization(vars.organizationId),
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte skapa API-nyckel',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('api_keys').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys.all });
      toast({ title: 'API-nyckel borttagen' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte ta bort API-nyckel',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
