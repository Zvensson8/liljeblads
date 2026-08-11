import { useMemo } from 'react';
import { useLocation, matchPath } from 'react-router-dom';

/** Page context injected into Jarvis so tools default to where the user is. */
export type JarvisPageContext = {
  property_id?: string;
  project_id?: string;
  component_id?: string;
  path: string;
  label?: string;
};

/**
 * Derive active property/project/component from the current route.
 * Used by the floating bubble and full Jarvis chat.
 */
export function useJarvisPageContext(): JarvisPageContext {
  const { pathname } = useLocation();

  return useMemo(() => {
    const property = matchPath('/property/:id', pathname);
    if (property?.params.id) {
      return {
        property_id: property.params.id,
        path: pathname,
        label: 'fastighetssida',
      };
    }

    const project = matchPath('/projects/:id', pathname);
    if (project?.params.id) {
      return {
        project_id: project.params.id,
        path: pathname,
        label: 'projektsida',
      };
    }

    const component = matchPath('/components/:id', pathname);
    if (component?.params.id) {
      return {
        component_id: component.params.id,
        path: pathname,
        label: 'komponentsida',
      };
    }

    return { path: pathname };
  }, [pathname]);
}
