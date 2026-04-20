DROP POLICY IF EXISTS "Org members can read their organization logos" ON storage.objects;

CREATE POLICY "Public can view organization logos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'organization-logos');