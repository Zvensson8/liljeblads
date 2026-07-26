-- Fix storage policies for component-documents bucket
-- These need to allow authenticated users to upload

-- First, ensure the bucket is public for reading
UPDATE storage.buckets 
SET public = true 
WHERE id = 'component-documents';

-- Drop any existing policies
DROP POLICY IF EXISTS "Authenticated users can upload component documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read component documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update component documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete component documents" ON storage.objects;

-- Create permissive policies for authenticated users on component-documents bucket
CREATE POLICY "Authenticated users can upload component documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'component-documents');

CREATE POLICY "Authenticated users can read component documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'component-documents');

CREATE POLICY "Authenticated users can update component documents"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'component-documents')
WITH CHECK (bucket_id = 'component-documents');

CREATE POLICY "Authenticated users can delete component documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'component-documents');