-- Ta bort den breda policyn och ersätt med en mer restriktiv variant
-- som kräver att klienten redan känner till filnamnet (förhindrar bulk-listning).
DROP POLICY IF EXISTS "Public can read organization logos" ON storage.objects;

-- Tillåt enbart inloggade organisations-medlemmar att lista/läsa sina egna logos
CREATE POLICY "Org members can read their organization logos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'organization-logos'
  AND (
    is_organization_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'founder'::app_role)
  )
);