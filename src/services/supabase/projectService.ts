/**
 * Project service — wraps the `projects` table with property joins and
 * archive filtering.
 */
import { supabase } from '@/integrations/supabase/client';
import { createCrudService } from './createCrudService';
import type {
  CreateProjectInput,
  ProjectListFilters,
  ProjectWithRelations,
  UpdateProjectInput,
} from '@/types/domain/project';

const base = createCrudService<
  ProjectWithRelations,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectListFilters
>({
  table: 'projects',
  // Keep table name key `properties` (matches ProjectWithRelations / dashboard widgets).
  // ProjectDetail must read `project.properties`, not `project.property`.
  select: `
    *,
    properties (id, name)
  `,
  defaultOrder: { column: 'created_at', ascending: false },
  applyFilters: (query, filters) => {
    let q = query;
    if (filters.archivedOnly) q = q.eq('is_archived', true);
    else if (!filters.showArchived) q = q.eq('is_archived', false);
    if (filters.propertyId) q = q.eq('property_id', filters.propertyId);
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.type) q = q.eq('type', filters.type);
    if (filters.year) q = q.eq('year', filters.year);
    return q;
  },
});

async function listForOrganization(
  filters: ProjectListFilters = {},
): Promise<ProjectWithRelations[]> {
  const useInner = !!filters.organizationId;
  let query = (supabase as any)
    .from('projects')
    .select(
      useInner
        ? `*, properties!inner (id, name, organization_id)`
        : `*, properties (id, name)`,
    )
    .order('created_at', { ascending: false });

  if (filters.archivedOnly) query = query.eq('is_archived', true);
  else if (!filters.showArchived) query = query.eq('is_archived', false);
  if (filters.propertyId) query = query.eq('property_id', filters.propertyId);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.type) query = query.eq('type', filters.type);
  if (filters.year) query = query.eq('year', filters.year);
  if (filters.organizationId) {
    query = query.eq('properties.organization_id', filters.organizationId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ProjectWithRelations[];
}

export const projectService = {
  ...base,
  list: listForOrganization,
};
