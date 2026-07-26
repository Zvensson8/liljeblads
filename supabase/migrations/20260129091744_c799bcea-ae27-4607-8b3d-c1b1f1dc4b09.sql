-- Fix PROJECT-DOCUMENTS BUCKET: Drop existing policies and create proper organization-scoped ones

-- Make bucket private
UPDATE storage.buckets 
SET public = false 
WHERE id = 'project-documents';

-- Drop ALL existing policies (both old overly permissive and partially created new ones)
DROP POLICY IF EXISTS "Authenticated users can upload project documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read project documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update project documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete project documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can read project documents for accessible projects" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload project documents for accessible projects" ON storage.objects;
DROP POLICY IF EXISTS "Users can update project documents for accessible projects" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete project documents for accessible projects" ON storage.objects;

-- Create proper organization-scoped policies for project-documents
-- The file path structure is: user_id/project_id/filename

-- SELECT: Users can only read files for projects they have access to
CREATE POLICY "Users can read project documents for accessible projects"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'project-documents' AND
  EXISTS (
    SELECT 1 FROM public.projects pr
    JOIN public.properties p ON pr.property_id = p.id
    WHERE (storage.foldername(storage.objects.name))[2]::uuid = pr.id
    AND (
      p.owner_id = auth.uid() 
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'founder'::public.app_role)
      OR (p.organization_id IS NOT NULL AND public.is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- INSERT: Users can only upload files for projects they have access to
CREATE POLICY "Users can upload project documents for accessible projects"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'project-documents' AND
  EXISTS (
    SELECT 1 FROM public.projects pr
    JOIN public.properties p ON pr.property_id = p.id
    WHERE (storage.foldername(storage.objects.name))[2]::uuid = pr.id
    AND (
      p.owner_id = auth.uid() 
      OR (p.organization_id IS NOT NULL AND public.is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- UPDATE: Users can only update files for projects they have access to
CREATE POLICY "Users can update project documents for accessible projects"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'project-documents' AND
  EXISTS (
    SELECT 1 FROM public.projects pr
    JOIN public.properties p ON pr.property_id = p.id
    WHERE (storage.foldername(storage.objects.name))[2]::uuid = pr.id
    AND (
      p.owner_id = auth.uid() 
      OR (p.organization_id IS NOT NULL AND public.is_organization_member(auth.uid(), p.organization_id))
    )
  )
)
WITH CHECK (
  bucket_id = 'project-documents' AND
  EXISTS (
    SELECT 1 FROM public.projects pr
    JOIN public.properties p ON pr.property_id = p.id
    WHERE (storage.foldername(storage.objects.name))[2]::uuid = pr.id
    AND (
      p.owner_id = auth.uid() 
      OR (p.organization_id IS NOT NULL AND public.is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- DELETE: Users can only delete files for projects they have access to
CREATE POLICY "Users can delete project documents for accessible projects"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'project-documents' AND
  EXISTS (
    SELECT 1 FROM public.projects pr
    JOIN public.properties p ON pr.property_id = p.id
    WHERE (storage.foldername(storage.objects.name))[2]::uuid = pr.id
    AND (
      p.owner_id = auth.uid() 
      OR (p.organization_id IS NOT NULL AND public.is_organization_member(auth.uid(), p.organization_id))
    )
  )
);