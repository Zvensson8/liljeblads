/**
 * Barrel for the Supabase service layer.
 *
 * Hooks (and only hooks) should import services from this module instead
 * of calling `supabase.from(...)` directly. This keeps the React layer
 * focused on caching/state and gives us a single place to add cross-
 * cutting concerns (logging, tracing, future retries on the data layer).
 */
export { createCrudService } from './createCrudService';
export type { CrudService, CrudServiceConfig } from './createCrudService';
export { subscribeToTable } from './realtimeRegistry';

export { propertyService } from './propertyService';
export { workOrderService } from './workOrderService';
export { componentService } from './componentService';
export { driftTaskService } from './driftTaskService';
export { maintenanceHistoryService } from './maintenanceHistoryService';
export { projectService } from './projectService';
export { todoService } from './todoService';
export { dashboardStatsService } from './dashboardStatsService';
export { energyDeclarationService } from './energyDeclarationService';
