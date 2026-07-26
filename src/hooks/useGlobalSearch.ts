import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface StandardSearchResult {
  id: string;
  type: 'property' | 'component' | 'work_order' | 'project';
  title: string;
  subtitle: string;
  path: string;
}

interface GlobalSearchOptions {
  query: string;
  enabled?: boolean;
}

/**
 * Hook: name-based search across properties, components, work orders and projects.
 * Mirrors the legacy inline search in GlobalSearchDialog.
 */
export function useGlobalSearch({ query, enabled = true }: GlobalSearchOptions) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['global-search', query],
    queryFn: async (): Promise<StandardSearchResult[]> => {
      if (!query || query.length < 2) return [];

      const pattern = `%${query}%`;
      const allResults: StandardSearchResult[] = [];

      // — Properties: name, address, property_number —
      const propertiesPromises = [
        supabase
          .from('properties')
          .select('id, name, address, property_number')
          .ilike('name', pattern)
          .limit(5),
        supabase
          .from('properties')
          .select('id, name, address, property_number')
          .ilike('address', pattern)
          .limit(5),
        supabase
          .from('properties')
          .select('id, name, address, property_number')
          .ilike('property_number', pattern)
          .limit(5),
      ];

      const propertiesResults = await Promise.all(propertiesPromises);
      type PropertyHit = { id: string; name: string; address: string | null; property_number: string | null };
      const uniqueProperties = new Map<string, PropertyHit>();
      propertiesResults.forEach((result) => {
        result.data?.forEach((p) => uniqueProperties.set(p.id, p as PropertyHit));
      });
      const properties = Array.from(uniqueProperties.values()).slice(0, 5);

      if (properties.length > 0) {
        allResults.push(
          ...properties.map((p) => ({
            id: p.id,
            type: 'property' as const,
            title: p.name,
            subtitle: p.address || `#${p.property_number || p.id.substring(0, 5)}`,
            path: `/properties/${p.id}`,
          }))
        );
      }

      // — Components: name (with floor + property joins) —
      const { data: components } = await supabase
        .from('components')
        .select(
          `
            id,
            name,
            type,
            floors:floor_id(
              property_id,
              properties(name)
            ),
            direct_property:property_id(
              id,
              name
            )
          `
        )
        .ilike('name', pattern)
        .limit(5);

      type ComponentHit = {
        id: string;
        name: string;
        type: string;
        floors?: { properties?: { name?: string } | null } | null;
        direct_property?: { id: string; name: string } | null;
      };
      if (components) {
        allResults.push(
          ...(components as unknown as ComponentHit[]).map((c) => {
            const propertyName =
              c.floors?.properties?.name || c.direct_property?.name || '';
            return {
              id: c.id,
              type: 'component' as const,
              title: c.name,
              subtitle: `${c.type}${propertyName ? ` - ${propertyName}` : ''}`,
              path: `/components/${c.id}`,
            };
          })
        );
      }

      // — Work orders: action (with properties join, exclude archived) —
      const { data: workOrders } = await supabase
        .from('work_orders')
        .select('id, action, properties(name)')
        .ilike('action', pattern)
        .neq('status', 'archived')
        .limit(5);

      type WorkOrderHit = { id: string; action: string; properties?: { name?: string } | null };
      if (workOrders) {
        allResults.push(
          ...(workOrders as unknown as WorkOrderHit[]).map((w) => ({
            id: w.id,
            type: 'work_order' as const,
            title: w.action,
            subtitle: w.properties?.name || '',
            path: `/work-orders?id=${w.id}`,
          }))
        );
      }

      // — Projects: name, project_number (with properties join, exclude archived) —
      const projectsPromises = [
        supabase
          .from('projects')
          .select('id, name, project_number, properties(name)')
          .ilike('name', pattern)
          .eq('is_archived', false)
          .limit(5),
        supabase
          .from('projects')
          .select('id, name, project_number, properties(name)')
          .ilike('project_number', pattern)
          .eq('is_archived', false)
          .limit(5),
      ];

      const projectsResults = await Promise.all(projectsPromises);
      type ProjectHit = { id: string; name: string; project_number: string; properties?: { name?: string } | null };
      const uniqueProjects = new Map<string, ProjectHit>();
      projectsResults.forEach((result) => {
        result.data?.forEach((p) => uniqueProjects.set(p.id, p as ProjectHit));
      });
      const projects = Array.from(uniqueProjects.values()).slice(0, 5);

      if (projects.length > 0) {
        allResults.push(
          ...projects.map((p) => ({
            id: p.id,
            type: 'project' as const,
            title: p.name,
            subtitle: `${p.project_number} - ${p.properties?.name || ''}`,
            path: `/projects/${p.id}`,
          }))
        );
      }

      return allResults;
    },
    enabled: enabled && !!user && query.length >= 2,
    staleTime: 1000 * 10, // 10 seconds — search results are short-lived
    gcTime: 1000 * 60 * 2,
  });
}
