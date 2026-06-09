import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { queryKeys } from '@/lib/queryKeys';
import type { Property, CreatePropertyInput } from '@/types/domain/property';

// Re-export the canonical domain types so existing imports
// (`import { Property } from '@/hooks/useProperties'`) keep working.
export type { Property, CreatePropertyInput } from '@/types/domain/property';

async function fetchPropertiesWithEnergyGrades(): Promise<Property[]> {
  const { data, error } = await supabase
    .from('properties')
    .select(`
      *,
      floors (
        id,
        name,
        level
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!data) return [];

  // Enrich with the latest energy grade per property (parallel fetches).
  const propertiesWithEnergyGrades = await Promise.all(
    data.map(async (property) => {
      const { data: historyData } = await supabase
        .from('property_energy_history')
        .select('energy_grade')
        .eq('property_id', property.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        ...property,
        energy_grade: historyData?.energy_grade ?? null,
      } as Property;
    })
  );

  return propertiesWithEnergyGrades;
}

/**
 * Hook: fetch all properties for the current user with enriched floors +
 * latest energy grade. Subscribes to realtime changes on the `properties`
 * table and invalidates the cache on any mutation so the UI stays fresh.
 */
export function useProperties() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.properties.list(),
    queryFn: fetchPropertiesWithEnergyGrades,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
  });

  // Realtime invalidation. If the table isn't in the supabase_realtime
  // publication this is a no-op (no errors thrown), so it remains safe.
  useEffect(() => {
    const channel = supabase
      .channel('properties-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'properties' },
        () => {
          queryClient.invalidateQueries({ queryKey: queryKeys.properties.all });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

export function useCreateProperty() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { organization } = useOrganization();

  return useMutation({
    mutationFn: async ({ name, address, description }: CreatePropertyInput) => {
      if (!organization?.id) {
        throw new Error('Du måste tillhöra en organisation för att skapa fastigheter.');
      }

      const { data, error } = await supabase
        .from('properties')
        .insert([{
          name: name.trim(),
          address: address?.trim() || null,
          description: description?.trim() || null,
          owner_id: user?.id,
          organization_id: organization.id,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.properties.all });
      toast({
        title: 'Fastighet skapad!',
        description: `${data.name} har lagts till.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fel vid skapande',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteProperty() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (propertyId: string) => {
      const { error } = await supabase
        .from('properties')
        .delete()
        .eq('id', propertyId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.properties.all });
      toast({
        title: 'Fastighet borttagen',
        description: 'Fastigheten har tagits bort.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Fel vid borttagning',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
