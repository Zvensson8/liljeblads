/**
 * Component service — wraps the `components` table with floor + property
 * joins.
 */
import { supabase } from '@/integrations/supabase/client';
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
    floors (id, name, level),
    properties (id, name, address)
  `,
  defaultOrder: { column: 'created_at', ascending: false },
  applyFilters: (query, filters) => {
    let q = query;
    if (filters.propertyId) q = q.eq('property_id', filters.propertyId);
    if (filters.floorId) q = q.eq('floor_id', filters.floorId);
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
        ? `*, floors (id, name, level), properties!inner (id, name, address, organization_id)`
        : `*, floors (id, name, level), properties (id, name, address)`,
    )
    .order('created_at', { ascending: false });

  if (filters.propertyId) query = query.eq('property_id', filters.propertyId);
  if (filters.floorId) query = query.eq('floor_id', filters.floorId);
  if (filters.type) query = query.eq('type', filters.type);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.organizationId) {
    query = query.eq('properties.organization_id', filters.organizationId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ComponentWithRelations[];
}

export const componentService = {
  ...base,
  list: listForOrganization,
};
