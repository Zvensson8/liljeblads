-- Fixa cirkulär RLS mellan properties och property_users
-- Skapa en security definer funktion för att kolla property assignments utan RLS

-- Skapa funktion för att kolla om användare har tilldelad fastighet
CREATE OR REPLACE FUNCTION public.user_has_property_assignment(_user_id uuid, _property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.property_users
    WHERE user_id = _user_id AND property_id = _property_id
  )
$$;

-- Återskapa properties SELECT policy utan cirkulär referens
DROP POLICY IF EXISTS "Users can view their organization properties" ON public.properties;

CREATE POLICY "Users can view their organization properties"
ON public.properties
FOR SELECT
TO authenticated
USING (
  (organization_id IS NOT NULL AND is_organization_member(auth.uid(), organization_id))
  OR has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'founder')
  OR user_has_property_assignment(auth.uid(), id)
);