-- 1. Create new app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- 2. Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 3. Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 5. Migrate existing role data from profiles to user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT id, 
  CASE 
    WHEN role = 'admin' THEN 'admin'::app_role
    ELSE 'user'::app_role
  END
FROM public.profiles
ON CONFLICT (user_id, role) DO NOTHING;

-- 6. Update RLS policies to use has_role instead of get_user_role

-- Drop old policies that use get_user_role
DROP POLICY IF EXISTS "Users can view own profile or admin can view all" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own properties" ON public.properties;
DROP POLICY IF EXISTS "Users can view floors of their properties" ON public.floors;
DROP POLICY IF EXISTS "Users can view components in their floors" ON public.components;
DROP POLICY IF EXISTS "Users can view geometry for their components" ON public.component_geometry;

-- Create new policies using has_role
CREATE POLICY "Users can view own profile or admin can view all"
ON public.profiles FOR SELECT
TO authenticated
USING ((id = auth.uid()) OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own properties"
ON public.properties FOR SELECT
TO authenticated
USING ((owner_id = auth.uid()) OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view floors of their properties"
ON public.floors FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties
    WHERE properties.id = floors.property_id
    AND (properties.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "Users can view components in their floors"
ON public.components FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM floors
    JOIN properties ON floors.property_id = properties.id
    WHERE floors.id = components.floor_id
    AND (properties.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "Users can view geometry for their components"
ON public.component_geometry FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM components
    JOIN floors ON components.floor_id = floors.id
    JOIN properties ON floors.property_id = properties.id
    WHERE components.id = component_geometry.component_id
    AND (properties.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))
  )
);

-- 7. Add RLS policies for user_roles table (admins only can view/modify)
CREATE POLICY "Admins can view all user roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert user roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete user roles"
ON public.user_roles FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- 8. Drop old get_user_role function
DROP FUNCTION IF EXISTS public.get_user_role(uuid);

-- 9. Remove role column from profiles (keeping for backward compatibility for now, but will be unused)
-- Note: Not dropping immediately to avoid breaking active sessions
-- Can be dropped in a future migration after confirming everything works
COMMENT ON COLUMN public.profiles.role IS 'DEPRECATED: Use user_roles table instead. Will be removed in future migration.';