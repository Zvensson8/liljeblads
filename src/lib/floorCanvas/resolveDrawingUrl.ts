import { supabase } from '@/integrations/supabase/client';
import { extractFloorDrawingPath } from '@/lib/floorCanvas/drawingPath';

export { extractFloorDrawingPath } from '@/lib/floorCanvas/drawingPath';

const BUCKET = 'floor-drawings';

export type ResolvedDrawing = {
  url: string;
  revoke: () => void;
  source: 'blob' | 'signed' | 'direct';
};

function formatStorageError(err: unknown): string {
  if (!err) return 'okänt fel';
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message && err.message !== '{}') {
    return err.message;
  }
  const e = err as {
    message?: string;
    error?: string;
    statusCode?: string | number;
    status?: number;
    name?: string;
  };
  const parts = [
    e.message && e.message !== '{}' ? e.message : null,
    e.error && e.error !== '{}' ? e.error : null,
    e.statusCode != null ? `status ${e.statusCode}` : null,
    e.status != null ? `HTTP ${e.status}` : null,
    e.name && e.name !== 'StorageUnknownError' ? e.name : null,
  ].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  try {
    const s = JSON.stringify(err);
    if (s && s !== '{}') return s;
  } catch {
    /* ignore */
  }
  return 'Åtkomst nekad eller filen saknas (RLS/behörighet). Kör storage-migration för floor-drawings.';
}

/**
 * Resolve a floor drawing for display.
 * Private bucket: authenticated download → blob URL, else signed URL.
 */
export async function resolveFloorDrawingUrl(
  storedUrl: string,
): Promise<ResolvedDrawing> {
  const path = extractFloorDrawingPath(storedUrl);

  // Ensure we have a session (storage RLS needs JWT)
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error('Du är inte inloggad — logga in igen för att visa ritningen.');
  }

  if (path) {
    // 1) Authenticated download
    const { data: blob, error: dlErr } = await supabase.storage
      .from(BUCKET)
      .download(path);

    if (!dlErr && blob && blob.size > 0) {
      const objectUrl = URL.createObjectURL(blob);
      return {
        url: objectUrl,
        revoke: () => URL.revokeObjectURL(objectUrl),
        source: 'blob',
      };
    }

    // 2) Signed URL (needs SELECT on object)
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

    // 3) Probe existence for clearer errors
    const folder = path.includes('/')
      ? path.slice(0, path.lastIndexOf('/'))
      : '';
    const fileName = path.includes('/')
      ? path.slice(path.lastIndexOf('/') + 1)
      : path;
    let existsHint = '';
    if (folder) {
      const { data: listed, error: listErr } = await supabase.storage
        .from(BUCKET)
        .list(folder, { search: fileName, limit: 5 });
      if (listErr) {
        existsHint = ` Listning misslyckades: ${formatStorageError(listErr)}.`;
      } else if (!listed?.some((f) => f.name === fileName)) {
        existsHint =
          ' Filen hittades inte i storage (kan ha raderats). Ladda upp ritningen igen.';
      } else {
        existsHint =
          ' Filen finns men SELECT nekades — saknar storage-policy (kör migration 20260727210000).';
      }
    }

    const detail =
      formatStorageError(dlErr) ||
      formatStorageError(signErr) ||
      'okänt storage-fel';

    throw new Error(
      `Kunde inte hämta ritning (${path}): ${detail}.${existsHint}`,
    );
  }

  return {
    url: storedUrl,
    revoke: () => {},
    source: 'direct',
  };
}
