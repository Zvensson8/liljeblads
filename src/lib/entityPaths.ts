/** Canonical in-app routes. Never use /properties/:id — that list path 404s. */

export function propertyPath(
  id: string,
  opts?: { tab?: string | null },
): string {
  const base = `/property/${id}`;
  const tab = opts?.tab?.trim();
  return tab ? `${base}?tab=${encodeURIComponent(tab)}` : base;
}

export function projectPath(id: string): string {
  return `/projects/${id}`;
}

export function componentPath(id: string): string {
  return `/components/${id}`;
}

export function maintenancePath(opts?: { property?: string | null }): string {
  const property = opts?.property?.trim();
  return property
    ? `/maintenance?property=${encodeURIComponent(property)}`
    : '/maintenance';
}
