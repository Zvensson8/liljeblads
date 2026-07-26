-- 1. Make floor-drawings bucket private
UPDATE storage.buckets 
SET public = false 
WHERE name = 'floor-drawings';

-- 2. Add Storage RLS policies for floor-drawings bucket
CREATE POLICY "Users can view their floor drawings"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'floor-drawings'
  AND (
    -- Allow if user owns the property
    EXISTS (
      SELECT 1 FROM public.floors f
      JOIN public.properties p ON f.property_id = p.id
      WHERE f.drawing_url LIKE '%' || storage.objects.name || '%'
      AND p.owner_id = auth.uid()
    )
    -- Or if user is admin
    OR has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Users can upload floor drawings"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'floor-drawings'
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can update their floor drawings"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'floor-drawings'
  AND (
    EXISTS (
      SELECT 1 FROM public.floors f
      JOIN public.properties p ON f.property_id = p.id
      WHERE f.drawing_url LIKE '%' || storage.objects.name || '%'
      AND p.owner_id = auth.uid()
    )
    OR has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "Users can delete their floor drawings"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'floor-drawings'
  AND (
    EXISTS (
      SELECT 1 FROM public.floors f
      JOIN public.properties p ON f.property_id = p.id
      WHERE f.drawing_url LIKE '%' || storage.objects.name || '%'
      AND p.owner_id = auth.uid()
    )
    OR has_role(auth.uid(), 'admin')
  )
);

-- 3. Add database constraints for input validation
-- Components table constraints
ALTER TABLE public.components
  ADD CONSTRAINT name_length CHECK (length(name) > 0 AND length(name) <= 200),
  ADD CONSTRAINT registration_number_length CHECK (registration_number IS NULL OR length(registration_number) <= 100),
  ADD CONSTRAINT manufacturer_length CHECK (manufacturer IS NULL OR length(manufacturer) <= 100),
  ADD CONSTRAINT model_length CHECK (model IS NULL OR length(model) <= 100),
  ADD CONSTRAINT serial_number_length CHECK (serial_number IS NULL OR length(serial_number) <= 100),
  ADD CONSTRAINT room_zone_length CHECK (room_zone IS NULL OR length(room_zone) <= 200),
  ADD CONSTRAINT notes_length CHECK (notes IS NULL OR length(notes) <= 5000),
  ADD CONSTRAINT installation_year_range CHECK (installation_year IS NULL OR (installation_year >= 1900 AND installation_year <= 2100));

-- Properties table constraints
ALTER TABLE public.properties
  ADD CONSTRAINT property_name_length CHECK (length(name) > 0 AND length(name) <= 200),
  ADD CONSTRAINT property_address_length CHECK (address IS NULL OR length(address) <= 500),
  ADD CONSTRAINT property_description_length CHECK (description IS NULL OR length(description) <= 2000);

-- Floors table constraints
ALTER TABLE public.floors
  ADD CONSTRAINT floor_name_length CHECK (length(name) > 0 AND length(name) <= 100);

-- Profiles table constraints
ALTER TABLE public.profiles
  ADD CONSTRAINT profile_full_name_length CHECK (full_name IS NULL OR length(full_name) <= 200),
  ADD CONSTRAINT profile_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');