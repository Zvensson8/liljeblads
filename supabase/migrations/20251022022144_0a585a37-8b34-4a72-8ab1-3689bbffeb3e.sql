-- Update RLS policies for user_roles to allow founder to manage all roles
DROP POLICY IF EXISTS "Admins can insert user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete user roles" ON public.user_roles;

-- Founders can view all user roles
CREATE POLICY "Founders can view all user roles"
ON public.user_roles
FOR SELECT
USING (has_role(auth.uid(), 'founder'));

-- Founders can insert user roles
CREATE POLICY "Founders can insert user roles"
ON public.user_roles
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'founder'));

-- Founders can update user roles
CREATE POLICY "Founders can update user roles"
ON public.user_roles
FOR UPDATE
USING (has_role(auth.uid(), 'founder'));

-- Founders can delete user roles
CREATE POLICY "Founders can delete user roles"
ON public.user_roles
FOR DELETE
USING (has_role(auth.uid(), 'founder'));