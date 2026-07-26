-- Drop ALL existing policies that need to be replaced
DROP POLICY IF EXISTS "Users can view properties they own or are shared with" ON public.properties;
DROP POLICY IF EXISTS "Users can view floors of accessible properties" ON public.floors;
DROP POLICY IF EXISTS "Users can view components in accessible floors" ON public.components;
DROP POLICY IF EXISTS "Users can view geometry for accessible components" ON public.component_geometry;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Create security definer function to check user role (prevents infinite recursion)
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = _user_id LIMIT 1;
$$;

-- Properties: Users can only view their own properties, admins can view all
CREATE POLICY "Users can view their own properties"
ON public.properties
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid() 
  OR public.get_user_role(auth.uid()) = 'admin'
);

-- Floors: Users can only view floors of properties they own, admins can view all
CREATE POLICY "Users can view floors of their properties"
ON public.floors
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties
    WHERE properties.id = floors.property_id
    AND (properties.owner_id = auth.uid() OR public.get_user_role(auth.uid()) = 'admin')
  )
);

-- Components: Users can only view components in floors they own, admins can view all
CREATE POLICY "Users can view components in their floors"
ON public.components
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM floors
    JOIN properties ON floors.property_id = properties.id
    WHERE floors.id = components.floor_id
    AND (properties.owner_id = auth.uid() OR public.get_user_role(auth.uid()) = 'admin')
  )
);

-- Component geometry: Users can only view geometry for components they own, admins can view all
CREATE POLICY "Users can view geometry for their components"
ON public.component_geometry
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM components
    JOIN floors ON components.floor_id = floors.id
    JOIN properties ON floors.property_id = properties.id
    WHERE components.id = component_geometry.component_id
    AND (properties.owner_id = auth.uid() OR public.get_user_role(auth.uid()) = 'admin')
  )
);

-- Profiles: Users can view their own profile, admins can view all profiles
CREATE POLICY "Users can view own profile or admin can view all"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid() 
  OR public.get_user_role(auth.uid()) = 'admin'
);