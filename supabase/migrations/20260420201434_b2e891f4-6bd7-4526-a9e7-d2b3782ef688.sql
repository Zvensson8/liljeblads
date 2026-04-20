-- 1. Lås api_rate_limits så endast service role kan komma åt det.
-- (Edge functions använder service-rolen och förbigår RLS automatiskt)
CREATE POLICY "Deny all client access to api_rate_limits"
ON public.api_rate_limits
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

-- 2. Lägg explicit SELECT-policy på organization-logos så filer kan läsas
-- via direkt URL men inte listas urskillningslöst.
CREATE POLICY "Public can read organization logos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'organization-logos');