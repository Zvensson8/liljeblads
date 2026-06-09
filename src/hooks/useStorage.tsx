import { useMutation } from '@tanstack/react-query';
import { storageService, type StorageBucket, type UploadOptions } from '@/services/supabase';

/**
 * Generic storage hooks. Use these instead of calling `supabase.storage.*`
 * directly from components.
 */

export interface UploadInput {
  bucket: StorageBucket;
  path: string;
  file: File | Blob;
  options?: UploadOptions;
}

export function useStorageUpload() {
  return useMutation({
    mutationFn: async ({ bucket, path, file, options }: UploadInput) => {
      await storageService.upload(bucket, path, file, options);
      return { path, publicUrl: storageService.getPublicUrl(bucket, path) };
    },
  });
}

export interface RemoveInput {
  bucket: StorageBucket;
  paths: string[];
}

export function useStorageRemove() {
  return useMutation({
    mutationFn: async ({ bucket, paths }: RemoveInput) => {
      await storageService.remove(bucket, paths);
    },
  });
}

export interface SignedUrlInput {
  bucket: StorageBucket;
  path: string;
  expiresIn?: number;
}

export function useCreateSignedUrl() {
  return useMutation({
    mutationFn: ({ bucket, path, expiresIn }: SignedUrlInput) =>
      storageService.createSignedUrl(bucket, path, expiresIn),
  });
}

export function useDownloadFile() {
  return useMutation({
    mutationFn: ({ bucket, path }: { bucket: StorageBucket; path: string }) =>
      storageService.download(bucket, path),
  });
}

export { storageService };
