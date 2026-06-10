/**
 * Energy declaration service — reads the "Miljö & energi" category +
 * field values for a property, writes the corresponding
 * `property_info_values` rows and appends a `property_energy_history`
 * snapshot.
 */
import { supabase } from '@/integrations/supabase/client';

export interface EnergyFieldIds {
  energyGrade?: string;
  primaryEnergy?: string;
  specificEnergy?: string;
}

export interface EnergyCurrentValues {
  energyGrade: string | null;
  primaryEnergyNumber: number | null;
  specificEnergyUse: number | null;
  fieldIds: EnergyFieldIds;
}

export interface EnergyUpdateInput {
  propertyId: string;
  userId: string | undefined;
  energyGrade: string | null;
  primaryEnergyNumber: number | null;
  specificEnergyUse: number | null;
  fieldIds: EnergyFieldIds;
}

export const energyDeclarationService = {
  async getCurrentValues(
    propertyId: string,
    organizationId: string,
  ): Promise<EnergyCurrentValues | null> {
    const { data: category, error: catError } = await supabase
      .from('property_info_categories')
      .select('id, name, fields:property_info_fields(*)')
      .eq('organization_id', organizationId)
      .eq('name', 'Miljö & energi')
      .maybeSingle();
    if (catError) throw catError;
    if (!category) return null;

    type EnergyField = { id: string; field_name: string };
    const fields = (category.fields ?? []) as EnergyField[];
    const energyGradeField = fields.find((f) => f.field_name === 'Energiklass');
    const primaryEnergyField = fields.find((f) => f.field_name === 'Primärenergital');
    const specificEnergyField = fields.find(
      (f) => f.field_name === 'Specifik energianvändning',
    );

    const fieldIdList = [
      energyGradeField?.id,
      primaryEnergyField?.id,
      specificEnergyField?.id,
    ].filter(Boolean) as string[];

    const { data: values, error: valError } = await supabase
      .from('property_info_values')
      .select('*')
      .eq('property_id', propertyId)
      .in('field_id', fieldIdList);
    if (valError) throw valError;

    const energyGradeValue = values?.find((v) => v.field_id === energyGradeField?.id);
    const primaryEnergyValue = values?.find((v) => v.field_id === primaryEnergyField?.id);
    const specificEnergyValue = values?.find(
      (v) => v.field_id === specificEnergyField?.id,
    );

    return {
      energyGrade: energyGradeValue?.value || null,
      primaryEnergyNumber: primaryEnergyValue?.value
        ? parseFloat(primaryEnergyValue.value)
        : null,
      specificEnergyUse: specificEnergyValue?.value
        ? parseFloat(specificEnergyValue.value)
        : null,
      fieldIds: {
        energyGrade: energyGradeField?.id,
        primaryEnergy: primaryEnergyField?.id,
        specificEnergy: specificEnergyField?.id,
      },
    };
  },

  async upsertDeclaration(input: EnergyUpdateInput): Promise<void> {
    const updates: Array<{
      property_id: string;
      field_id: string;
      value: string;
      updated_by: string | undefined;
    }> = [];

    if (input.fieldIds.energyGrade && input.energyGrade !== null) {
      updates.push({
        property_id: input.propertyId,
        field_id: input.fieldIds.energyGrade,
        value: input.energyGrade,
        updated_by: input.userId,
      });
    }
    if (input.fieldIds.primaryEnergy && input.primaryEnergyNumber !== null) {
      updates.push({
        property_id: input.propertyId,
        field_id: input.fieldIds.primaryEnergy,
        value: input.primaryEnergyNumber.toString(),
        updated_by: input.userId,
      });
    }
    if (input.fieldIds.specificEnergy && input.specificEnergyUse !== null) {
      updates.push({
        property_id: input.propertyId,
        field_id: input.fieldIds.specificEnergy,
        value: input.specificEnergyUse.toString(),
        updated_by: input.userId,
      });
    }

    if (updates.length > 0) {
      const { error } = await supabase
        .from('property_info_values')
        .upsert(updates, { onConflict: 'property_id,field_id' });
      if (error) throw error;
    }

    const { error: historyError } = await supabase
      .from('property_energy_history')
      .insert({
        property_id: input.propertyId,
        energy_grade: input.energyGrade,
        primary_energy_number: input.primaryEnergyNumber,
        specific_energy_use: input.specificEnergyUse,
        created_by: input.userId,
      });
    if (historyError) throw historyError;
  },
};
