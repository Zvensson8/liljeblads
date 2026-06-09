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
export const queryKeys = {
  properties: {
    all: ['properties'] as const,
    lists: () => [...queryKeys.properties.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.properties.lists(), filters ?? {}] as const,
    details: () => [...queryKeys.properties.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.properties.details(), id] as const,
  },
  workOrders: {
    all: ['work-orders'] as const,
    lists: () => [...queryKeys.workOrders.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.workOrders.lists(), filters ?? {}] as const,
    details: () => [...queryKeys.workOrders.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.workOrders.details(), id] as const,
    byProject: (projectId: string) =>
      [...queryKeys.workOrders.all, 'project', projectId] as const,
    byProperty: (propertyId: string) =>
      [...queryKeys.workOrders.all, 'property', propertyId] as const,
  },
  components: {
    all: ['components'] as const,
    lists: () => [...queryKeys.components.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.components.lists(), filters ?? {}] as const,
    details: () => [...queryKeys.components.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.components.details(), id] as const,
    byProperty: (propertyId: string) =>
      [...queryKeys.components.all, 'property', propertyId] as const,
  },
  maintenanceHistory: {
    all: ['maintenance-history'] as const,
    lists: () => [...queryKeys.maintenanceHistory.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.maintenanceHistory.lists(), filters ?? {}] as const,
    details: () => [...queryKeys.maintenanceHistory.all, 'detail'] as const,
    detail: (id: string) =>
      [...queryKeys.maintenanceHistory.details(), id] as const,
    byComponent: (componentId: string) =>
      [...queryKeys.maintenanceHistory.all, 'component', componentId] as const,
  },

  dashboardStats: {
    all: ['dashboard-stats'] as const,
    lists: () => [...queryKeys.dashboardStats.all, 'list'] as const,
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.dashboardStats.lists(), filters ?? {}] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
