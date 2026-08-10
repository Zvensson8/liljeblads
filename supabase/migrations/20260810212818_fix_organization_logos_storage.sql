-- Fix organization-logos storage: SELECT policy was missing in production
-- (blocked public reads and often upsert/upload flows). Re-create full set
-- of policies for owner/admin/founder.

-- Ensure bucket exists and is public
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('organization-logos', 'organization-logos', true, 5242880)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = COALESCE(storage.buckets.file_size_limit, 5242880);

-- Drop old policies (names from original + later migrations)
DROP POLICY IF EXISTS "Organization logos are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public can read organization logos" ON storage.objects;
DROP POLICY IF EXISTS "Organization admins can upload logos" ON storage.objects;
DROP POLICY IF EXISTS "Organization admins can update logos" ON storage.objects;
DROP POLICY IF EXISTS "Organization admins can delete logos" ON storage.objects;

-- Anyone can read (public bucket / logo display in app)
CREATE POLICY "Public can read organization logos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'organization-logos');

-- Helper expression: first path segment is organization id
-- Path format: {org_id}/logo-{timestamp}.{ext}

CREATE POLICY "Org admins can upload logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'organization-logos'
  AND (
    public.has_organization_role(auth.uid(), (storage.foldername(name))[1]::uuid, 'owner')
    OR public.has_organization_role(auth.uid(), (storage.foldername(name))[1]::uuid, 'admin')
    OR public.has_role(auth.uid(), 'founder'::app_role)
  )
);

CREATE POLICY "Org admins can update logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'organization-logos'
  AND (
    public.has_organization_role(auth.uid(), (storage.foldername(name))[1]::uuid, 'owner')
    OR public.has_organization_role(auth.uid(), (storage.foldername(name))[1]::uuid, 'admin')
    OR public.has_role(auth.uid(), 'founder'::app_role)
  )
)
WITH CHECK (
  bucket_id = 'organization-logos'
  AND (
    public.has_organization_role(auth.uid(), (storage.foldername(name))[1]::uuid, 'owner')
    OR public.has_organization_role(auth.uid(), (storage.foldername(name))[1]::uuid, 'admin')
    OR public.has_role(auth.uid(), 'founder'::app_role)
  )
);

CREATE POLICY "Org admins can delete logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'organization-logos'
  AND (
    public.has_organization_role(auth.uid(), (storage.foldername(name))[1]::uuid, 'owner')
    OR public.has_organization_role(auth.uid(), (storage.foldername(name))[1]::uuid, 'admin')
    OR public.has_role(auth.uid(), 'founder'::app_role)
  )
);
