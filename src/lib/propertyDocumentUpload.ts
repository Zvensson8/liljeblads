/**
 * Shared upload of one property document + versioning.
 */
import { supabase } from '@/integrations/supabase/client';
import { storageService } from '@/services/supabase';

export async function uploadPropertyDocumentFile(opts: {
  propertyId: string;
  userId: string;
  file: File;
  /** Optional path prefix inside storage (e.g. zip folder) */
  nameOverride?: string;
}): Promise<{ id: string; name: string }> {
  const { propertyId, userId, file } = opts;
  const docName = (opts.nameOverride || file.name).replace(/^.*\//, '');

  const { data: existingDocs } = await supabase
    .from('property_documents')
    .select('version')
    .eq('property_id', propertyId)
    .eq('name', docName);

  const nextVersion =
    existingDocs && existingDocs.length > 0
      ? Math.max(...existingDocs.map((d) => d.version || 1)) + 1
      : 1;

  const fileExt = docName.split('.').pop() || 'bin';
  const filePath = `${userId}/${propertyId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`;

  await storageService.upload('property-documents', filePath, file);
  const publicUrl = storageService.getPublicUrl('property-documents', filePath);

  const { data: inserted, error: dbError } = await supabase
    .from('property_documents')
    .insert([
      {
        property_id: propertyId,
        name: docName,
        file_url: publicUrl,
        file_size: file.size,
        mime_type: file.type || null,
        version: nextVersion,
        is_latest: true,
      },
    ])
    .select('id, name')
    .single();

  if (dbError) throw dbError;
  if (!inserted) throw new Error('Ingen rad returnerades');
  return { id: inserted.id as string, name: inserted.name as string };
}
