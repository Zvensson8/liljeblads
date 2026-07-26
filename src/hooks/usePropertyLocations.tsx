import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PropertyLocation {
  property_id: string;
  latitude: number;
  longitude: number;
  formatted_address: string | null;
  last_geocoded: string | null;
}

export const usePropertyLocations = () => {
  const queryClient = useQueryClient();

  const { data: locations, isLoading } = useQuery({
    queryKey: ['property-locations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('property_locations')
        .select(`
          *,
          properties (
            id,
            name,
            address
          )
        `);

      if (error) throw error;
      return data;
    },
  });

  const geocodeMutation = useMutation({
    mutationFn: async (propertyId: string) => {
      const { data: property } = await supabase
        .from('properties')
        .select('address')
        .eq('id', propertyId)
        .single();

      if (!property?.address) {
        throw new Error('Ingen adress angiven');
      }

      // This will be implemented via edge function later
      // For now, we'll just create a placeholder
      const { error } = await supabase
        .from('property_locations')
        .upsert({
          property_id: propertyId,
          latitude: 59.3293, // Stockholm placeholder
          longitude: 18.0686,
          formatted_address: property.address,
          last_geocoded: new Date().toISOString(),
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['property-locations'] });
      toast.success('Position uppdaterad');
    },
    onError: () => {
      toast.error('Kunde inte geokoda adressen');
    },
  });

  return {
    locations,
    isLoading,
    geocodeProperty: geocodeMutation.mutate,
    isGeocoding: geocodeMutation.isPending,
  };
};
