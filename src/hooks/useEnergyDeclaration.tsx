import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getLatestEnergyHistory, getPreviousEnergyHistory } from "@/lib/energyUtils";

export interface EnergyData {
  energyGrade: string | null;
  primaryEnergyNumber: number | null;
  specificEnergyUse: number | null;
}

export function useEnergyDeclaration(propertyId: string, organizationId: string | null) {
  const queryClient = useQueryClient();

  // Fetch current energy values from property_info_values
  const { data: currentValues, isLoading: isLoadingCurrent } = useQuery({
    queryKey: ['energy-declaration', propertyId],
    queryFn: async () => {
      // Get categories for this organization
      const { data: categories, error: catError } = await supabase
        .from('property_info_categories')
        .select('id, name, fields:property_info_fields(*)')
        .eq('organization_id', organizationId)
        .eq('name', 'Miljö & energi')
        .maybeSingle();

      if (catError) throw catError;
      if (!categories) return null;

      // Get field IDs
      const energyGradeField = categories.fields?.find((f: any) => f.field_name === 'Energiklass');
      const primaryEnergyField = categories.fields?.find((f: any) => f.field_name === 'Primärenergital');
      const specificEnergyField = categories.fields?.find((f: any) => f.field_name === 'Specifik energianvändning');

      // Fetch values
      const { data: values, error: valError } = await supabase
        .from('property_info_values')
        .select('*')
        .eq('property_id', propertyId)
        .in('field_id', [
          energyGradeField?.id,
          primaryEnergyField?.id,
          specificEnergyField?.id
        ].filter(Boolean));

      if (valError) throw valError;

      const energyGradeValue = values?.find(v => v.field_id === energyGradeField?.id);
      const primaryEnergyValue = values?.find(v => v.field_id === primaryEnergyField?.id);
      const specificEnergyValue = values?.find(v => v.field_id === specificEnergyField?.id);

      return {
        energyGrade: energyGradeValue?.value || null,
        primaryEnergyNumber: primaryEnergyValue?.value ? parseFloat(primaryEnergyValue.value) : null,
        specificEnergyUse: specificEnergyValue?.value ? parseFloat(specificEnergyValue.value) : null,
        fieldIds: {
          energyGrade: energyGradeField?.id,
          primaryEnergy: primaryEnergyField?.id,
          specificEnergy: specificEnergyField?.id,
        }
      };
    },
    enabled: !!organizationId,
  });

  // Fetch latest history
  const { data: latestHistory } = useQuery({
    queryKey: ['energy-history-latest', propertyId],
    queryFn: () => getLatestEnergyHistory(propertyId),
  });

  // Fetch previous history for comparison
  const { data: previousHistory } = useQuery({
    queryKey: ['energy-history-previous', propertyId],
    queryFn: () => getPreviousEnergyHistory(propertyId),
  });

  // Update energy declaration
  const updateEnergy = useMutation({
    mutationFn: async (data: EnergyData & { fieldIds: any }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update property_info_values
      const updates = [];
      
      if (data.fieldIds.energyGrade && data.energyGrade !== null) {
        updates.push({
          property_id: propertyId,
          field_id: data.fieldIds.energyGrade,
          value: data.energyGrade,
          updated_by: user?.id,
        });
      }
      
      if (data.fieldIds.primaryEnergy && data.primaryEnergyNumber !== null) {
        updates.push({
          property_id: propertyId,
          field_id: data.fieldIds.primaryEnergy,
          value: data.primaryEnergyNumber.toString(),
          updated_by: user?.id,
        });
      }
      
      if (data.fieldIds.specificEnergy && data.specificEnergyUse !== null) {
        updates.push({
          property_id: propertyId,
          field_id: data.fieldIds.specificEnergy,
          value: data.specificEnergyUse.toString(),
          updated_by: user?.id,
        });
      }

      const { error: updateError } = await supabase
        .from('property_info_values')
        .upsert(updates, { onConflict: 'property_id,field_id' });

      if (updateError) throw updateError;

      // Save to history
      const { error: historyError } = await supabase
        .from('property_energy_history')
        .insert({
          property_id: propertyId,
          energy_grade: data.energyGrade,
          primary_energy_number: data.primaryEnergyNumber,
          specific_energy_use: data.specificEnergyUse,
          created_by: user?.id,
        });

      if (historyError) throw historyError;

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['energy-declaration', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['energy-history-latest', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['energy-history-previous', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['property-info-values', propertyId] });
      toast.success("Energideklaration uppdaterad");
    },
    onError: (error) => {
      console.error('Error updating energy declaration:', error);
      toast.error("Kunde inte uppdatera energideklaration");
    },
  });

  return {
    currentValues: currentValues || { energyGrade: null, primaryEnergyNumber: null, specificEnergyUse: null, fieldIds: {} },
    latestHistory,
    previousHistory,
    isLoading: isLoadingCurrent,
    updateEnergy,
  };
}
