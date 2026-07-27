const BUCKET = 'floor-drawings';

/**
 * Extract storage object path from a stored drawing_url.
 * Handles public, signed, authenticated URLs and raw paths.
 * Pure (no Supabase client) — safe for unit tests.
 */
export function extractFloorDrawingPath(urlOrPath: string): string | null {
  const raw = (urlOrPath || '').trim();
  if (!raw) return null;

  if (!raw.includes('://') && !raw.startsWith('/')) {
    return raw.replace(/^floor-drawings\//, '');
  }

  const markers = [
    `/storage/v1/object/public/${BUCKET}/`,
    `/storage/v1/object/sign/${BUCKET}/`,
    `/storage/v1/object/authenticated/${BUCKET}/`,
  ];

  for (const marker of markers) {
    const idx = raw.indexOf(marker);
    if (idx >= 0) {
      const rest = raw.slice(idx + marker.length).split('?')[0];
      try {
        return decodeURIComponent(rest);
      } catch {
        return rest;
      }
    }
  }

  const m = raw.match(/\/floor-drawings\/([^?#]+)/);
  if (m?.[1]) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }

  return null;
}
