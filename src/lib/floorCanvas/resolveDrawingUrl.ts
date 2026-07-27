import { supabase } from '@/integrations/supabase/client';
import { extractFloorDrawingPath } from '@/lib/floorCanvas/drawingPath';

export { extractFloorDrawingPath } from '@/lib/floorCanvas/drawingPath';

const BUCKET = 'floor-drawings';

export type ResolvedDrawing = {
  /** URL safe to pass to FabricImage.fromURL (blob: preferred) */
  url: string;
  /** Call on unmount / reload */
  revoke: () => void;
  source: 'blob' | 'signed' | 'direct';
};

/**
 * Resolve a floor drawing for display.
 * Bucket is private — public URLs fail. Prefer authenticated download → blob URL
 * (no CORS/canvas taint issues). Fall back to signed URL, then direct.
 */
export async function resolveFloorDrawingUrl(
  storedUrl: string,
): Promise<ResolvedDrawing> {
  const path = extractFloorDrawingPath(storedUrl);

  if (path) {
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(path);

    if (!dlErr && blob) {
      const objectUrl = URL.createObjectURL(blob);
      return {
        url: objectUrl,
        revoke: () => URL.revokeObjectURL(objectUrl),
        source: 'blob',
      };
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60);

    if (!signErr && signed?.signedUrl) {
      return {
        url: signed.signedUrl,
        revoke: () => {},
        source: 'signed',
      };
    }

    const detail = dlErr?.message || signErr?.message || 'okänt storage-fel';
    throw new Error(
      `Kunde inte hämta ritning från storage (${path}): ${detail}`,
    );
  }

  return {
    url: storedUrl,
    revoke: () => {},
    source: 'direct',
  };
}
