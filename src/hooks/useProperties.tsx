import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';

export interface Property {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
  area_sqm: number | null;
  construction_year: number | null;
  property_type: string | null;
  loa: string | null;
  property_number: string | null;
  invoice_address: string | null;
  floors?: { id: string; name: string; level: number }[];
  energy_grade?: string | null;
}

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

  // Fetch energy grades for all properties in parallel
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
        energy_grade: historyData?.energy_grade || null
      };
    })
  );

  return propertiesWithEnergyGrades;
}

export function useProperties() {
  const { toast } = useToast();

  return useQuery({
    queryKey: ['properties'],
    queryFn: fetchPropertiesWithEnergyGrades,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
  });
}

interface CreatePropertyInput {
  name: string;
  address?: string;
  description?: string;
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
          organization_id: organization.id
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['properties'] });
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
      queryClient.invalidateQueries({ queryKey: ['properties'] });
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
