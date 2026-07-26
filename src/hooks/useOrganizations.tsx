/**
 * Founder-only hooks for managing every organization in the platform.
 *
 * These are *not* scoped to the current user's org membership — they
 * read/write the raw `organizations` table and are intended for the
 * Founder admin surface, gated by `useIsFounder`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { queryKeys } from '@/lib/queryKeys';

export interface Organization {
  id: string;
  name: string;
  subscription_tier: string;
  max_properties: number;
  max_users: number;
  max_components: number;
  max_work_orders: number;
  max_projects: number;
  max_documents: number;
  max_storage_mb: number;
  notes: string | null;
  created_at: string;
}

export function useOrganizations() {
  const { session } = useAuth();
  return useQuery<Organization[]>({
    queryKey: queryKeys.organizations.list(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Organization[];
    },
    enabled: !!session,
    staleTime: 1000 * 60 * 2,
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: Partial<Organization> & { name: string }) => {
      const { error } = await supabase.from('organizations').insert(input as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
      toast({ title: 'Organisation skapad' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte skapa organisation',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Organization>;
    }) => {
      const { error } = await supabase
        .from('organizations')
        .update(patch as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
      toast({ title: 'Organisation uppdaterad' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte uppdatera organisation',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('organizations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.all });
      toast({ title: 'Organisation raderad' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte radera organisation',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export interface FounderStats {
  totalOrganizations: number;
  totalUsers: number;
  totalProperties: number;
  totalComponents: number;
  totalRevenue: number;
  subscriptionTiers: string[];
}

const TIER_PRICES: Record<string, number> = {
  small: 45000,
  medium: 150000,
  large: 450000,
  enterprise: 900000,
};

export function useFounderStats() {
  const { session } = useAuth();
  return useQuery<FounderStats>({
    queryKey: queryKeys.founderStats.list(),
    queryFn: async () => {
      const [orgsResult, usersResult, propertiesResult, componentsResult] =
        await Promise.all([
          supabase.from('organizations').select('subscription_tier', { count: 'exact' }),
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('properties').select('id', { count: 'exact', head: true }),
          supabase.from('components').select('id', { count: 'exact', head: true }),
        ]);

      const tiers = (orgsResult.data ?? []).map((o) => o.subscription_tier);
      const revenue = tiers.reduce((sum, t) => sum + (TIER_PRICES[t] || 0), 0);

      return {
        totalOrganizations: orgsResult.count ?? 0,
        totalUsers: usersResult.count ?? 0,
        totalProperties: propertiesResult.count ?? 0,
        totalComponents: componentsResult.count ?? 0,
        totalRevenue: revenue,
        subscriptionTiers: tiers,
      };
    },
    enabled: !!session,
    staleTime: 1000 * 60 * 2,
  });
}
