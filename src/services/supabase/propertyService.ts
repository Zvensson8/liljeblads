/**
 * Property service — properties + energy-grade enrichment.
 *
 * Wraps the generic CRUD service for the `properties` table and adds the
 * domain-specific `listWithEnergyGrades` reader used by `useProperties`.
 */
import { supabase } from '@/integrations/supabase/client';
import { repairMaybe, repairSwedishMojibake } from '@/lib/encoding';
import { createCrudService } from './createCrudService';
import type { Property, CreatePropertyInput } from '@/types/domain/property';

const base = createCrudService<Property, Partial<Property>, Partial<Property>>({
  table: 'properties',
  select: `*`,
  defaultOrder: { column: 'created_at', ascending: false },
});

async function listWithEnergyGrades(organizationId?: string): Promise<Property[]> {
  let query = supabase
    .from('properties')
    .select(`*`)
    .order('created_at', { ascending: false });

  // Defense in depth: explicit org filter in addition to RLS
  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as Property[];
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

      return repairPropertyText({
        ...property,
        energy_grade: history?.energy_grade ?? null,
      } as Property);
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
        name: repairSwedishMojibake(payload.name.trim()),
        address: repairMaybe(payload.address?.trim() || null),
        description: repairMaybe(payload.description?.trim() || null),
        property_number: payload.property_number?.trim() || null,
        area_sqm: payload.area_sqm ?? null,
        construction_year: payload.construction_year ?? null,
        property_type: payload.property_type?.trim() || null,
        loa: payload.loa?.trim() || null,
        invoice_address: repairMaybe(payload.invoice_address?.trim() || null),
        owner_id: ownerId,
        organization_id: organizationId,
      },
    ])
    .select()
    .single();
  if (error) throw error;
  return data as Property;
}

async function countDependents(propertyId: string): Promise<{
  components: number;
  workOrders: number;
  projects: number;
}> {
  const [components, workOrders, projects] = await Promise.all([
    supabase
      .from('components')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', propertyId),
    supabase
      .from('work_orders')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', propertyId),
    supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', propertyId),
  ]);
  return {
    components: components.count ?? 0,
    workOrders: workOrders.count ?? 0,
    projects: projects.count ?? 0,
  };
}

function repairPropertyText(property: Property): Property {
  return {
    ...property,
    name: repairSwedishMojibake(property.name ?? ''),
    address: repairMaybe(property.address),
    description: repairMaybe(property.description),
    invoice_address: repairMaybe(property.invoice_address),
  };
}

export const propertyService = {
  ...base,
  list: async (filters?: unknown) =>
    ((await base.list(filters as never)) as Property[]).map(repairPropertyText),
  getById: async (id: string) => {
    const row = await base.getById(id);
    return row ? repairPropertyText(row) : null;
  },
  listWithEnergyGrades,
  createForOrganization,
  countDependents,
};
