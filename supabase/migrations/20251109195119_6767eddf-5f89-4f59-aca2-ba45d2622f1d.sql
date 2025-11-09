-- Fixa infinite recursion i RLS policies för property_users
-- Ta bort de rekursiva policies
DROP POLICY IF EXISTS "Organization admins can insert property assignments" ON public.property_users;
DROP POLICY IF EXISTS "Organization admins can delete property assignments" ON public.property_users;
DROP POLICY IF EXISTS "Organization admins can view property assignments" ON public.property_users;

-- Skapa enklare policies utan cirkulära referenser
-- Använd bara founder och admin roller för property_users, inte organisation-checks via properties
CREATE POLICY "Admins and founders can insert property assignments"
ON public.property_users
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin') 
  OR has_role(auth.uid(), 'founder')
);

CREATE POLICY "Admins and founders can delete property assignments"
ON public.property_users
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin') 
  OR has_role(auth.uid(), 'founder')
);

CREATE POLICY "Admins and founders can view property assignments"
ON public.property_users
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin') 
  OR has_role(auth.uid(), 'founder')
);