-- Make floor-drawings bucket public so images can be displayed
UPDATE storage.buckets 
SET public = true 
WHERE id = 'floor-drawings';

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own floor drawings" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own floor drawings" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own floor drawings" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own floor drawings" ON storage.objects;

-- Add RLS policies for floor-drawings bucket
CREATE POLICY "Users can view their own floor drawings"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'floor-drawings' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can upload their own floor drawings"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'floor-drawings' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own floor drawings"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'floor-drawings' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own floor drawings"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'floor-drawings' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);