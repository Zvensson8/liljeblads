/**
 * Property service — properties + energy-grade enrichment.
 *
 * Wraps the generic CRUD service for the `properties` table and adds the
 * domain-specific `listWithEnergyGrades` reader used by `useProperties`.
 */
import { supabase } from '@/integrations/supabase/client';
import { createCrudService } from './createCrudService';
import type { Property, CreatePropertyInput } from '@/types/domain/property';

const base = createCrudService<Property, Partial<Property>, Partial<Property>>({
  table: 'properties',
  select: `
    *,
    floors (
      id,
      name,
      level
    )
  `,
  defaultOrder: { column: 'created_at', ascending: false },
});

async function listWithEnergyGrades(): Promise<Property[]> {
  const rows = await base.list();
  if (rows.length === 0) return [];

  return Promise.all(
    rows.map(async (property) => {
      const { data: history } = await supabase
        .from('property_energy_history')
        .select('energy_grade')
        .eq('property_id', property.id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        ...property,
        energy_grade: history?.energy_grade ?? null,
      } as Property;
    }),
  );
}

async function createForOrganization(input: {
  payload: CreatePropertyInput;
  ownerId: string | undefined;
  organizationId: string;
}): Promise<Property> {
  const { payload, ownerId, organizationId } = input;
  const { data, error } = await supabase
    .from('properties')
    .insert([
      {
        name: payload.name.trim(),
        address: payload.address?.trim() || null,
        description: payload.description?.trim() || null,
        owner_id: ownerId,
        organization_id: organizationId,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data as Property;
}

export const propertyService = {
  ...base,
  listWithEnergyGrades,
  createForOrganization,
};
