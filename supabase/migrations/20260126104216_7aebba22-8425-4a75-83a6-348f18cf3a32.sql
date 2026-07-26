-- Fix organizations_public view security issue
-- The view currently bypasses RLS on the underlying organizations table

-- Step 1: Drop the existing view
DROP VIEW IF EXISTS public.organizations_public;

-- Step 2: Recreate the view with SECURITY INVOKER (so RLS on organizations is enforced)
CREATE VIEW public.organizations_public 
WITH (security_invoker = true)
AS 
SELECT 
    id,
    name,
    max_properties,
    max_users,
    created_at,
    updated_at,
    subscription_tier,
    logo_url,
    primary_color,
    notes
FROM organizations;

-- Step 3: Grant SELECT on the view to authenticated users
GRANT SELECT ON public.organizations_public TO authenticated;

-- Step 4: Add a policy on organizations table for members to view basic info (via view)
-- First check if such policy exists to avoid duplicate
DO $$
BEGIN
    -- Create policy for organization members to SELECT via view
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'organizations' 
        AND policyname = 'Organization members can view their org via public view'
    ) THEN
        CREATE POLICY "Organization members can view their org via public view"
        ON public.organizations
        FOR SELECT
        USING (
            is_organization_member(auth.uid(), id)
        );
    END IF;
END $$;