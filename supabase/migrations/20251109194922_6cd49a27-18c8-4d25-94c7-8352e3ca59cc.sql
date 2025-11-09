-- Uppdatera RLS policies för property_users så att organisationsägare kan hantera dem

-- Ta bort befintliga policies
DROP POLICY IF EXISTS "Admins can insert property assignments" ON public.property_users;
DROP POLICY IF EXISTS "Admins can delete property assignments" ON public.property_users;
DROP POLICY IF EXISTS "Admins can view all property assignments" ON public.property_users;

-- Skapa nya policies som tillåter organisations-admins
CREATE POLICY "Organization admins can insert property assignments"
ON public.property_users
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_users.property_id
    AND (
      has_role(auth.uid(), 'admin') 
      OR has_role(auth.uid(), 'founder')
      OR (p.organization_id IS NOT NULL AND has_organization_role(auth.uid(), p.organization_id, 'owner'))
      OR (p.organization_id IS NOT NULL AND has_organization_role(auth.uid(), p.organization_id, 'admin'))
    )
  )
);

CREATE POLICY "Organization admins can delete property assignments"
ON public.property_users
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_users.property_id
    AND (
      has_role(auth.uid(), 'admin') 
      OR has_role(auth.uid(), 'founder')
      OR (p.organization_id IS NOT NULL AND has_organization_role(auth.uid(), p.organization_id, 'owner'))
      OR (p.organization_id IS NOT NULL AND has_organization_role(auth.uid(), p.organization_id, 'admin'))
    )
  )
);

CREATE POLICY "Organization admins can view property assignments"
ON public.property_users
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin') 
  OR has_role(auth.uid(), 'founder')
  OR EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_users.property_id
    AND p.organization_id IS NOT NULL 
    AND has_organization_role(auth.uid(), p.organization_id, 'owner')
  )
  OR EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_users.property_id
    AND p.organization_id IS NOT NULL 
    AND has_organization_role(auth.uid(), p.organization_id, 'admin')
  )
);