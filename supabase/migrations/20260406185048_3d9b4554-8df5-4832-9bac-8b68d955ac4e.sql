
-- 1. Remove overly permissive maintenance-documents storage policies
DROP POLICY IF EXISTS "Users can view maintenance documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their maintenance documents" ON storage.objects;

-- 2. Make floor-drawings bucket private
UPDATE storage.buckets SET public = false WHERE id = 'floor-drawings';

-- 3. Remove unauthenticated/overly broad floor-drawings policies
DROP POLICY IF EXISTS "Users can view floor drawings" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload floor drawings" ON storage.objects;
