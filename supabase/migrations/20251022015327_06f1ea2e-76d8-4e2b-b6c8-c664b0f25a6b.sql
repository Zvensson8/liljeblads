-- Skapa storage bucket för organisations-logotyper
INSERT INTO storage.buckets (id, name, public) 
VALUES ('organization-logos', 'organization-logos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies för organization-logos bucket
CREATE POLICY "Organization logos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'organization-logos');

CREATE POLICY "Organization admins can upload logos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'organization-logos' 
  AND (
    public.has_organization_role(auth.uid(), (storage.foldername(name))[1]::uuid, 'owner')
    OR public.has_organization_role(auth.uid(), (storage.foldername(name))[1]::uuid, 'admin')
  )
);

CREATE POLICY "Organization admins can update logos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'organization-logos'
  AND (
    public.has_organization_role(auth.uid(), (storage.foldername(name))[1]::uuid, 'owner')
    OR public.has_organization_role(auth.uid(), (storage.foldername(name))[1]::uuid, 'admin')
  )
);

CREATE POLICY "Organization admins can delete logos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'organization-logos'
  AND (
    public.has_organization_role(auth.uid(), (storage.foldername(name))[1]::uuid, 'owner')
    OR public.has_organization_role(auth.uid(), (storage.foldername(name))[1]::uuid, 'admin')
  )
);