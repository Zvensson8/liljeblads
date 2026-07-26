/**
 * Project service — wraps the `projects` table with property joins and
 * archive filtering.
 */
import { createCrudService } from './createCrudService';
import type {
  CreateProjectInput,
  ProjectListFilters,
  ProjectWithRelations,
  UpdateProjectInput,
} from '@/types/domain/project';

export const projectService = createCrudService<
  ProjectWithRelations,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectListFilters
>({
  table: 'projects',
  select: `
    *,
    properties (id, name)
  `,
  defaultOrder: { column: 'created_at', ascending: false },
  applyFilters: (query, filters) => {
    let q = query;
    if (!filters.showArchived) q = q.eq('is_archived', false);
    if (filters.propertyId) q = q.eq('property_id', filters.propertyId);
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.type) q = q.eq('type', filters.type);
    if (filters.year) q = q.eq('year', filters.year);
    return q;
  },
});
