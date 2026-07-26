-- Fix for organizations billing exposure security issue
-- Create a public view that excludes sensitive billing fields for regular members

-- Step 1: Create a secure view for regular members that excludes billing info
CREATE OR REPLACE VIEW public.organizations_public
WITH (security_invoker = on) AS
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
  -- EXCLUDED: billing_contact, invoice_email, payment_status, next_billing_date, last_payment_date, billing_cycle
FROM public.organizations;

-- Step 2: Grant access to the view
GRANT SELECT ON public.organizations_public TO authenticated;

-- Step 3: Drop the existing "Members can view basic organization info" policy
-- This policy currently allows all members to see ALL organization fields including billing
DROP POLICY IF EXISTS "Members can view basic organization info" ON public.organizations;

-- Step 4: Create a new restrictive policy for regular members that denies direct SELECT
-- Regular members should use the organizations_public view instead
CREATE POLICY "Members can view basic org info via view only"
ON public.organizations
FOR SELECT
USING (
  -- Only allow direct access for admins/owners/founders
  has_role(auth.uid(), 'founder'::app_role)
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_organization_role(auth.uid(), id, 'owner'::text)
  OR has_organization_role(auth.uid(), id, 'admin'::text)
);

-- Note: The "Admins can view all organization info" policy already exists and covers founders/admins/owners
-- The new policy ensures regular members cannot directly query the organizations table