-- Fix storage policies for project-documents bucket
-- Same fix as for component-documents

-- Ensure the bucket is public for reading
UPDATE storage.buckets 
SET public = true 
WHERE id = 'project-documents';

-- Drop any existing restrictive policies for project-documents
DROP POLICY IF EXISTS "Authenticated users can upload project documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read project documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update project documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete project documents" ON storage.objects;

-- Create permissive policies for authenticated users on project-documents bucket
CREATE POLICY "Authenticated users can upload project documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-documents');

CREATE POLICY "Authenticated users can read project documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'project-documents');

CREATE POLICY "Authenticated users can update project documents"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'project-documents')
WITH CHECK (bucket_id = 'project-documents');

CREATE POLICY "Authenticated users can delete project documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-documents');