import { supabase } from '@/integrations/supabase/client';

export type StorageBucket =
  | 'maintenance-documents'
  | 'property-documents'
  | 'component-documents'
  | 'project-documents'
  | 'floor-drawings'
  | 'organization-logos'
  | 'todo-attachments'
  | (string & {});

export interface UploadOptions {
  cacheControl?: string;
  upsert?: boolean;
  contentType?: string;
}

export const storageService = {
  async upload(bucket: StorageBucket, path: string, file: File | Blob, options: UploadOptions = {}) {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
      cacheControl: options.cacheControl ?? '3600',
      upsert: options.upsert ?? false,
      contentType: options.contentType,
    });
    if (error) throw error;
    return { path };
  },

  getPublicUrl(bucket: StorageBucket, path: string) {
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  },

  async createSignedUrl(bucket: StorageBucket, path: string, expiresIn = 60) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error) throw error;
    return data.signedUrl;
  },

  async download(bucket: StorageBucket, path: string) {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error) throw error;
    return data;
  },

  async remove(bucket: StorageBucket, paths: string[]) {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) throw error;
  },
};
