/**
 * Central query key registry for TanStack Query.
 *
 * Conventions:
 *  - All keys are tuples starting with the domain name.
 *  - Use `all` for the broadest invalidation scope of a domain.
 *  - Use `lists()` / `list(filters)` for collection queries.
 *  - Use `details()` / `detail(id)` for single-entity queries.
 *
 * Inspired by https://tkdodo.eu/blog/effective-react-query-keys
 */

/**
 * Factory for the standard 4-shape key set (all / lists / list /
 * details / detail). Keeps the registry below from repeating the same
 * boilerplate for every entity.
 */
function makeEntityKeys<TName extends string>(name: TName) {
  const all = [name] as const;
  const lists = () => [...all, 'list'] as const;
  const details = () => [...all, 'detail'] as const;
  return {
    all,
    lists,
    list: (filters?: Record<string, unknown>) =>
      [...lists(), filters ?? {}] as const,
    details,
    detail: (id: string) => [...details(), id] as const,
  };
}

export const queryKeys = {
  properties: {
    ...makeEntityKeys('properties'),
  },
  workOrders: {
    ...makeEntityKeys('work-orders'),
    byProject: (projectId: string) =>
      ['work-orders', 'project', projectId] as const,
    byProperty: (propertyId: string) =>
      ['work-orders', 'property', propertyId] as const,
  },
  components: {
    ...makeEntityKeys('components'),
    byProperty: (propertyId: string) =>
      ['components', 'property', propertyId] as const,
  },
  maintenanceHistory: {
    ...makeEntityKeys('maintenance-history'),
    byComponent: (componentId: string) =>
      ['maintenance-history', 'component', componentId] as const,
  },
  dashboardStats: makeEntityKeys('dashboard-stats'),
  projects: {
    ...makeEntityKeys('projects'),
    byProperty: (propertyId: string) =>
      ['projects', 'property', propertyId] as const,
  },
  todos: {
    ...makeEntityKeys('todos'),
    byProperty: (propertyId: string) =>
      ['todos', 'property', propertyId] as const,
  },
  driftTasks: {
    ...makeEntityKeys('drift-tasks'),
    byProperty: (propertyId: string) =>
      ['drift-tasks', 'property', propertyId] as const,
  },

  // — Newly consolidated entities —
  floors: makeEntityKeys('floors'),
  driftCategories: makeEntityKeys('drift-categories'),
  recurringCosts: makeEntityKeys('recurring-costs'),
  recurringCostHistory: makeEntityKeys('recurring-cost-history'),
  propertyDocuments: makeEntityKeys('property-documents'),
  propertyContacts: makeEntityKeys('property-contacts'),
  propertyNotes: makeEntityKeys('property-notes'),
  componentDocuments: makeEntityKeys('component-documents'),
  projectDocuments: makeEntityKeys('project-documents'),
  workOrderFiles: makeEntityKeys('work-order-files'),
  maintenanceDocuments: makeEntityKeys('maintenance-history-documents'),
  scheduledReports: makeEntityKeys('scheduled-reports'),
  userConsents: makeEntityKeys('user-consents'),
  aiSuggestedActions: makeEntityKeys('ai-suggested-actions'),
  aiConversations: makeEntityKeys('ai-conversations'),
  aiMessages: {
    ...makeEntityKeys('ai-messages'),
    byConversation: (conversationId: string) =>
      ['ai-messages', 'conversation', conversationId] as const,
  },
  profiles: makeEntityKeys('profiles'),
} as const;

export type QueryKeys = typeof queryKeys;
