import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { energyDeclarationService } from '@/services/supabase';
import type { EnergyFieldIds } from '@/services/supabase/energyDeclarationService';
import { getLatestEnergyHistory, getPreviousEnergyHistory } from '@/lib/energyUtils';

export interface EnergyData {
  energyGrade: string | null;
  primaryEnergyNumber: number | null;
  specificEnergyUse: number | null;
}

export function useEnergyDeclaration(
  propertyId: string,
  organizationId: string | null,
) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: currentValues, isLoading: isLoadingCurrent } = useQuery({
    queryKey: ['energy-declaration', propertyId],
    queryFn: () =>
      organizationId
        ? energyDeclarationService.getCurrentValues(propertyId, organizationId)
        : null,
    enabled: !!organizationId,
  });

  const { data: latestHistory } = useQuery({
    queryKey: ['energy-history-latest', propertyId],
    queryFn: () => getLatestEnergyHistory(propertyId),
  });

  const { data: previousHistory } = useQuery({
    queryKey: ['energy-history-previous', propertyId],
    queryFn: () => getPreviousEnergyHistory(propertyId),
  });

  const updateEnergy = useMutation({
    mutationFn: async (
      data: EnergyData & { fieldIds: Record<string, string | undefined> },
    ) => {
      await energyDeclarationService.upsertDeclaration({
        propertyId,
        userId: user?.id,
        energyGrade: data.energyGrade,
        primaryEnergyNumber: data.primaryEnergyNumber,
        specificEnergyUse: data.specificEnergyUse,
        fieldIds: data.fieldIds,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['energy-declaration', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['energy-history-latest', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['energy-history-previous', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['property-info-values', propertyId] });
      toast.success('Energideklaration uppdaterad');
    },
    onError: (error) => {
      console.error('Error updating energy declaration:', error);
      toast.error('Kunde inte uppdatera energideklaration');
    },
  });

  return {
    currentValues:
      currentValues ?? {
        energyGrade: null,
        primaryEnergyNumber: null,
        specificEnergyUse: null,
        fieldIds: {},
      },
    latestHistory,
    previousHistory,
    isLoading: isLoadingCurrent,
    updateEnergy,
  };
}
