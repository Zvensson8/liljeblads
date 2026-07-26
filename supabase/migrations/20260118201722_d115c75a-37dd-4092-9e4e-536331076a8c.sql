-- Fix: Restrict profiles table access for regular org members
-- The "Org members can view colleague names only" policy currently exposes all columns including email
-- We need to drop this policy and ensure regular members can only see limited profile info

-- Drop the overly permissive policy for regular org members
DROP POLICY IF EXISTS "Org members can view colleague names only" ON public.profiles;

-- Create a more restrictive policy - org members can only view their own row OR be looked up by admins
-- Note: The "Org admins can view member emails in their org" policy already handles admin access
-- Note: The "Users can view own profile" policy already handles self-access
-- Note: The "System admins can view all profiles" policy already handles system admin access

-- For the FounderUsers component and other places that need to display member names,
-- org admins already have access through the existing "Org admins can view member emails in their org" policy

-- We need to allow members to see ONLY the full_name (not email) of colleagues
-- Since RLS is row-level, we'll create a security definer function to get colleague names only

CREATE OR REPLACE FUNCTION public.get_organization_member_names(org_id uuid)
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name
  FROM public.profiles p
  WHERE p.organization_id = org_id
$$;

-- Grant execute to authenticated users (they can call this function but only get names, not emails)
GRANT EXECUTE ON FUNCTION public.get_organization_member_names(uuid) TO authenticated;