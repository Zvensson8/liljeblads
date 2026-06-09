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

// — Core domain entities —
export { propertyService } from './propertyService';
export { workOrderService } from './workOrderService';
export { componentService } from './componentService';
export { driftTaskService } from './driftTaskService';
export { maintenanceHistoryService } from './maintenanceHistoryService';
export { projectService } from './projectService';
export { todoService } from './todoService';
export { dashboardStatsService } from './dashboardStatsService';
export { energyDeclarationService } from './energyDeclarationService';

// — Newly consolidated entities —
export { floorService } from './floorService';
export type { Floor, FloorInsert, FloorUpdate, FloorListFilters } from './floorService';

export { driftCategoryService } from './driftCategoryService';
export type {
  DriftCategory,
  DriftCategoryInsert,
  DriftCategoryUpdate,
  DriftCategoryFilters,
} from './driftCategoryService';

export {
  recurringCostService,
  recurringCostHistoryService,
} from './recurringCostService';
export type {
  RecurringCost,
  RecurringCostInsert,
  RecurringCostUpdate,
  RecurringCostFilters,
  RecurringCostHistory,
  RecurringCostHistoryInsert,
} from './recurringCostService';

export { propertyDocumentService } from './propertyDocumentService';
export type {
  PropertyDocument,
  PropertyDocumentInsert,
  PropertyDocumentUpdate,
  PropertyDocumentFilters,
} from './propertyDocumentService';

export { propertyContactService } from './propertyContactService';
export type {
  PropertyContact,
  PropertyContactInsert,
  PropertyContactUpdate,
  PropertyContactFilters,
} from './propertyContactService';

export { propertyNoteService } from './propertyNoteService';
export type {
  PropertyNote,
  PropertyNoteInsert,
  PropertyNoteUpdate,
  PropertyNoteFilters,
} from './propertyNoteService';

export { componentDocumentService } from './componentDocumentService';
export type {
  ComponentDocument,
  ComponentDocumentInsert,
  ComponentDocumentUpdate,
  ComponentDocumentFilters,
} from './componentDocumentService';

export { projectDocumentService } from './projectDocumentService';
export type {
  ProjectDocument,
  ProjectDocumentInsert,
  ProjectDocumentUpdate,
  ProjectDocumentFilters,
} from './projectDocumentService';

export { workOrderFileService } from './workOrderFileService';
export type {
  WorkOrderFile,
  WorkOrderFileInsert,
  WorkOrderFileUpdate,
  WorkOrderFileFilters,
} from './workOrderFileService';

export { maintenanceDocumentService } from './maintenanceDocumentService';
export type {
  MaintenanceDocument,
  MaintenanceDocumentInsert,
  MaintenanceDocumentUpdate,
  MaintenanceDocumentFilters,
} from './maintenanceDocumentService';

export { scheduledReportService } from './scheduledReportService';
export type {
  ScheduledReport,
  ScheduledReportInsert,
  ScheduledReportUpdate,
  ScheduledReportFilters,
} from './scheduledReportService';

export { userConsentService } from './userConsentService';
export type {
  UserConsent,
  UserConsentInsert,
  UserConsentUpdate,
  UserConsentFilters,
} from './userConsentService';

export { aiSuggestedActionService } from './aiSuggestedActionService';
export type {
  AISuggestedAction,
  AISuggestedActionInsert,
  AISuggestedActionUpdate,
  AISuggestedActionFilters,
} from './aiSuggestedActionService';

export { aiConversationService, aiMessageService } from './aiConversationService';
export type {
  AIConversation,
  AIConversationInsert,
  AIConversationUpdate,
  AIConversationFilters,
  AIMessage,
  AIMessageInsert,
} from './aiConversationService';

export { profileService } from './profileService';
export type {
  Profile,
  ProfileInsert,
  ProfileUpdate,
  ProfileFilters,
} from './profileService';
