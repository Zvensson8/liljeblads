-- floor-drawings is private; ensure authenticated org members can
-- read/write drawings for floors in their organization.
-- Path convention: {user_id}/{floor_id}/{filename}

-- Drop legacy policies (names vary across earlier migrations)
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

-- Helper: can current user access a floor id (second path segment)
CREATE OR REPLACE FUNCTION public.can_access_floor_drawing(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Own uploads under first folder = auth.uid()
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

-- Keep bucket private
UPDATE storage.buckets SET public = false WHERE id = 'floor-drawings';
