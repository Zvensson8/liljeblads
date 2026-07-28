-- floor-drawings private bucket RLS (org members + own uploads)
-- Path: {user_id}/{floor_id}/{filename}
--
-- If you get deadlock in SQL Editor: run the 3 blocks BELOW one at a time
-- (select each block, Run), wait 1–2s between them. Close other Dashboard tabs.

-- =============================================================================
-- BLOCK 1 — helper function only
-- =============================================================================
CREATE OR REPLACE FUNCTION public.can_access_floor_drawing(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT
    (storage.foldername(object_name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1
      FROM public.floors f
      JOIN public.properties p ON p.id = f.property_id
      WHERE f.id::text = (storage.foldername(object_name))[2]
        AND (
          p.owner_id = auth.uid()
          OR (
            p.organization_id IS NOT NULL
            AND public.is_organization_member(auth.uid(), p.organization_id)
          )
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'founder'::app_role)
        )
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_floor_drawing(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_floor_drawing(text) TO authenticated;

-- =============================================================================
-- BLOCK 2 — drop old policies only (retry this alone if deadlock)
-- =============================================================================
DROP POLICY IF EXISTS "Users can view their own floor drawings" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own floor drawings" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own floor drawings" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own floor drawings" ON storage.objects;
DROP POLICY IF EXISTS "Users can view floor drawings" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload floor drawings" ON storage.objects;
DROP POLICY IF EXISTS "Org members can read floor drawings" ON storage.objects;
DROP POLICY IF EXISTS "Org members can upload floor drawings" ON storage.objects;
DROP POLICY IF EXISTS "Org members can update floor drawings" ON storage.objects;
DROP POLICY IF EXISTS "Org members can delete floor drawings" ON storage.objects;

-- =============================================================================
-- BLOCK 3 — create new policies + keep bucket private
-- =============================================================================
CREATE POLICY "Org members can read floor drawings"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'floor-drawings'
  AND public.can_access_floor_drawing(name)
);

CREATE POLICY "Org members can upload floor drawings"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'floor-drawings'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.can_access_floor_drawing(name)
  )
);

CREATE POLICY "Org members can update floor drawings"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'floor-drawings'
  AND public.can_access_floor_drawing(name)
)
WITH CHECK (
  bucket_id = 'floor-drawings'
  AND public.can_access_floor_drawing(name)
);

CREATE POLICY "Org members can delete floor drawings"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'floor-drawings'
  AND public.can_access_floor_drawing(name)
);

UPDATE storage.buckets SET public = false WHERE id = 'floor-drawings';
