/**
 * Component service — wraps the `components` table with property joins.
 */
import { supabase } from '@/integrations/supabase/client';
import { repairMaybe, repairSwedishMojibake } from '@/lib/encoding';
import { createCrudService } from './createCrudService';
import type {
  ComponentListFilters,
  ComponentWithRelations,
  CreateComponentInput,
  UpdateComponentInput,
} from '@/types/domain/component';

const base = createCrudService<
  ComponentWithRelations,
  CreateComponentInput,
  UpdateComponentInput,
  ComponentListFilters
>({
  table: 'components',
  select: `
    *,
    properties (id, name, address)
  `,
  defaultOrder: { column: 'created_at', ascending: false },
  applyFilters: (query, filters) => {
    let q = query;
    if (filters.propertyId) q = q.eq('property_id', filters.propertyId);
    if (filters.type) q = q.eq('type', filters.type);
    if (filters.status) q = q.eq('status', filters.status);
    return q;
  },
});

/**
 * List components scoped to an organization via property.organization_id.
 * Uses !inner join so founder/platform bypass cannot leak other orgs in the UI.
 */
async function listForOrganization(
  filters: ComponentListFilters = {},
): Promise<ComponentWithRelations[]> {
  const useInner = !!filters.organizationId;
  let query = (supabase as any)
    .from('components')
    .select(
      useInner
        ? `*, properties!inner (id, name, address, organization_id)`
        : `*, properties (id, name, address)`,
    )
    .order('created_at', { ascending: false });

  if (filters.propertyId) query = query.eq('property_id', filters.propertyId);
  if (filters.type) query = query.eq('type', filters.type);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.organizationId) {
    query = query.eq('properties.organization_id', filters.organizationId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as ComponentWithRelations[]).map(repairComponentText);
}

function repairComponentText(c: ComponentWithRelations): ComponentWithRelations {
  return {
    ...c,
    name: repairSwedishMojibake(c.name ?? ''),
    manufacturer: repairMaybe(c.manufacturer),
    model: repairMaybe(c.model),
    notes: repairMaybe(c.notes),
    room_zone: repairMaybe(c.room_zone),
    supplier: repairMaybe(c.supplier),
    properties: c.properties
      ? {
          ...c.properties,
          name: repairSwedishMojibake(c.properties.name ?? ''),
          address: repairMaybe(c.properties.address ?? null),
        }
      : c.properties,
  };
}

export const componentService = {
  ...base,
  list: listForOrganization,
  getById: async (id: string) => {
    const row = await base.getById(id);
    return row ? repairComponentText(row) : null;
  },
};
