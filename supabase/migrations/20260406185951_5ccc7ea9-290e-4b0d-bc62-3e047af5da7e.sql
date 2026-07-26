-- 1. Remove the overly broad SELECT policy on organizations that exposes billing data to all members
-- Members should access org data via the organizations_public view which excludes sensitive fields
DROP POLICY IF EXISTS "Organization members can view their org via public view" ON public.organizations;

-- 2. Remove the permissive floor drawings upload policy (only checks auth.uid() IS NOT NULL)
-- The stricter "Users can upload their own floor drawings" policy with path-based check remains
DROP POLICY IF EXISTS "Users can upload floor drawings" ON storage.objects;

-- 3. Make property-documents bucket private
UPDATE storage.buckets SET public = false WHERE id = 'property-documents';