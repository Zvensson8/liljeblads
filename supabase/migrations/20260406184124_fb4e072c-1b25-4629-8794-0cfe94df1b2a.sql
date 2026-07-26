-- Remove overly permissive storage policies on project-documents bucket
DROP POLICY IF EXISTS "Anyone can view project-documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload to project-documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update project-documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete project-documents" ON storage.objects;