-- Drop existing policies for project-documents to recreate them properly
DROP POLICY IF EXISTS "Authenticated users can insert project documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can select project documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update project documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete project documents" ON storage.objects;

-- Create permissive policies for project-documents bucket
CREATE POLICY "Anyone can upload to project-documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'project-documents');

CREATE POLICY "Anyone can view project-documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'project-documents');

CREATE POLICY "Anyone can update project-documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'project-documents');

CREATE POLICY "Anyone can delete project-documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'project-documents');