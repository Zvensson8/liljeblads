import { z } from 'zod';
import type { Database } from '@/integrations/supabase/types';

/**
 * Domain schema for a Project.
 *
 * Mirrors the `projects` table. Enums (`type`, `status`) are referenced
 * from the DB-generated types so they stay in sync with migrations.
 */

type DbProjectStatus = Database['public']['Enums']['project_status'];
type DbProjectType = Database['public']['Enums']['project_type'];

export const projectStatusSchema = z.custom<DbProjectStatus>(
  (val) => typeof val === 'string'
);
export const projectTypeSchema = z.custom<DbProjectType>(
  (val) => typeof val === 'string'
);

export const projectSchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  project_number: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: projectTypeSchema,
  status: projectStatusSchema,
  project_manager: z.string().nullable(),
  actors: z.array(z.string()).nullable(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  budget: z.number().nullable(),
  forecast: z.number().nullable(),
  actual_cost: z.number().nullable(),
  is_archived: z.boolean().nullable(),
  year: z.number().nullable(),
  start_quarter: z.number().nullable(),
  end_quarter: z.number().nullable(),
  created_by: z.string().uuid().nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type ProjectStatus = DbProjectStatus;
export type ProjectType = DbProjectType;
export type Project = z.infer<typeof projectSchema>;

export type ProjectWithRelations = Project & {
  properties?: { id: string; name: string } | null;
};

export type CreateProjectInput =
  Database['public']['Tables']['projects']['Insert'];
export type UpdateProjectInput =
  Database['public']['Tables']['projects']['Update'];

export interface ProjectListFilters {
  propertyId?: string;
  status?: ProjectStatus;
  type?: ProjectType;
  year?: number;
  showArchived?: boolean;
}
