-- Fix user_roles RLS so users can read their own roles.
-- Previous policies only allowed founders to SELECT (via has_role),
-- and clients often got empty role lists / failed founder checks.

-- Own roles (required for app navigation / useIsFounder / useIsAdmin)
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Founders still manage all roles (keep existing founder policies if present)
DROP POLICY IF EXISTS "Founders can view all user roles" ON public.user_roles;
CREATE POLICY "Founders can view all user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'founder'::app_role));

-- Admins can also view all roles (useful for Users admin UI)
DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
CREATE POLICY "Admins can view all user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Convenience RPC (SECURITY DEFINER) — always returns caller's roles
CREATE OR REPLACE FUNCTION public.get_my_roles()
RETURNS SETOF public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_roles() TO authenticated;

-- Ensure founder still has founder+admin (idempotent bootstrap for primary user)
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, r.role
FROM public.profiles p
CROSS JOIN (VALUES ('founder'::app_role), ('admin'::app_role)) AS r(role)
WHERE p.email = 'andreas@liljeblads.com'
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.profiles
SET approved = true
WHERE email = 'andreas@liljeblads.com';
