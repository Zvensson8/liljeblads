import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { useRealtimeInvalidation } from '@/hooks/internal/useRealtimeInvalidation';
import { queryKeys } from '@/lib/queryKeys';
import { propertyService } from '@/services/supabase';
import type { Property, CreatePropertyInput } from '@/types/domain/property';

export type { Property, CreatePropertyInput } from '@/types/domain/property';

/**
 * Hook: fetch all properties for the current user with enriched floors +
 * latest energy grade. Subscribes to realtime changes on the `properties`
 * table and invalidates the cache on any mutation so the UI stays fresh.
 */
export function useProperties() {
  useRealtimeInvalidation('properties', queryKeys.properties.all);

  return useQuery({
    queryKey: queryKeys.properties.list(),
    queryFn: () => propertyService.listWithEnergyGrades(),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

/**
 * Hook: fetch a single property by id.
 */
export function useProperty(id: string | undefined) {
  useRealtimeInvalidation('properties', queryKeys.properties.all);

  return useQuery({
    queryKey: queryKeys.properties.detail(id ?? ''),
    queryFn: () => propertyService.getById(id as string),
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });
}

export function useCreateProperty() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { organization } = useOrganization();

  return useMutation({
    mutationFn: async (payload: CreatePropertyInput) => {
      if (!organization?.id) {
        throw new Error('Du måste tillhöra en organisation för att skapa fastigheter.');
      }
      return propertyService.createForOrganization({
        payload,
        ownerId: user?.id,
        organizationId: organization.id,
      });
    },
    onSuccess: (data: Property) => {
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

export function useUpdateProperty() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Property> }) =>
      propertyService.update(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.properties.all });
      toast({ title: 'Fastighet uppdaterad' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Kunde inte uppdatera fastighet',
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
    mutationFn: (propertyId: string) => propertyService.remove(propertyId),
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
