/**
 * Barrel export for the domain types layer.
 *
 * Source of truth for entity shapes = the auto-generated Supabase types at
 * `@/integrations/supabase/types`. The files in this folder add:
 *   - Zod schemas for runtime validation at trust boundaries
 *   - Joined / relation-aware composite types used by lists and queries
 *   - Insert / Update aliases for service-layer calls
 *
 * Import from this barrel whenever possible:
 *   import { type WorkOrder, type Todo, propertySchema } from '@/types/domain';
 */

export * from './component';
export * from './dashboardStats';
export * from './driftTask';
export * from './maintenanceHistory';
export * from './organization';
export * from './profile';
export * from './project';
export * from './property';
export * from './todo';
export * from './todoAttachment';
export * from './workOrder';
