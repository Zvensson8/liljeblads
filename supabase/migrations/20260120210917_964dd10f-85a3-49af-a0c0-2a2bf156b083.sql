-- Fix component-documents storage bucket security
-- Set the bucket to private (not public)
UPDATE storage.buckets 
SET public = false 
WHERE id = 'component-documents';

-- Also fix maintenance-documents bucket if it exists
UPDATE storage.buckets 
SET public = false 
WHERE id = 'maintenance-documents';

-- Drop existing overly permissive storage policies for component-documents
DROP POLICY IF EXISTS "Authenticated users can upload component documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read component documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update component documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete component documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access" ON storage.objects;

-- Create proper storage policies that check organization membership via component ownership
-- These policies join through component_documents -> components -> properties to verify access

-- SELECT policy for component-documents bucket
CREATE POLICY "Org members can view component documents storage"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'component-documents' AND
  (
    -- Check if user has access through component -> property -> organization chain
    EXISTS (
      SELECT 1 
      FROM component_documents cd
      JOIN components c ON cd.component_id = c.id
      LEFT JOIN floors f ON c.floor_id = f.id
      LEFT JOIN properties p1 ON f.property_id = p1.id
      LEFT JOIN properties p2 ON c.property_id = p2.id
      WHERE storage.objects.name LIKE '%/' || cd.id || '%'
        OR storage.objects.name LIKE '%' || SPLIT_PART(cd.file_url, '/', -1)
      AND (
        (p1.owner_id = auth.uid()) OR 
        (p2.owner_id = auth.uid()) OR
        ((p1.organization_id IS NOT NULL) AND is_organization_member(auth.uid(), p1.organization_id)) OR
        ((p2.organization_id IS NOT NULL) AND is_organization_member(auth.uid(), p2.organization_id))
      )
    )
    OR
    -- Allow access based on storage path structure (user_id/component_id/file)
    -- The path contains user_id as first segment - allow owner to access their uploads
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    has_role(auth.uid(), 'admin'::app_role)
    OR
    has_role(auth.uid(), 'founder'::app_role)
  )
);

-- INSERT policy for component-documents bucket
CREATE POLICY "Org members can upload component documents storage"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'component-documents' AND
  auth.uid() IS NOT NULL AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- UPDATE policy for component-documents bucket
CREATE POLICY "Org members can update component documents storage"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'component-documents' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'founder'::app_role)
  )
);

-- DELETE policy for component-documents bucket
CREATE POLICY "Org members can delete component documents storage"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'component-documents' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'founder'::app_role)
  )
);

-- Also fix maintenance-documents bucket policies if they exist
DROP POLICY IF EXISTS "Authenticated users can upload maintenance documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read maintenance documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update maintenance documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete maintenance documents" ON storage.objects;

-- Create proper maintenance-documents policies
CREATE POLICY "Org members can view maintenance documents storage"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'maintenance-documents' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'founder'::app_role)
  )
);

CREATE POLICY "Org members can upload maintenance documents storage"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'maintenance-documents' AND
  auth.uid() IS NOT NULL AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Org members can update maintenance documents storage"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'maintenance-documents' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'founder'::app_role)
  )
);

CREATE POLICY "Org members can delete maintenance documents storage"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'maintenance-documents' AND
  (
    (storage.foldername(name))[1] = auth.uid()::text
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'founder'::app_role)
  )
);