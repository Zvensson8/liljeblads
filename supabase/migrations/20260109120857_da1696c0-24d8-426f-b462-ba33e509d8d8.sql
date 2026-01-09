-- Security Fix: Remove overly permissive RLS policies
-- Note: We're not moving the vector extension as it has dependencies

-- Security Fix: Remove overly permissive RLS policy on embeddings table
-- This table should only be accessible via service role (Edge Functions) for writes
-- Keep the organization-scoped SELECT policy for reads
DROP POLICY IF EXISTS "System can manage embeddings" ON public.embeddings;

-- The existing "Users can view embeddings for their organization" SELECT policy is fine
-- Edge Functions use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS for writes

-- Security Fix: Restrict organization_pricing_history INSERT policy
-- Only founders/admins should be able to insert pricing history, not any authenticated user
DROP POLICY IF EXISTS "System can insert pricing history" ON public.organization_pricing_history;

-- Create a properly scoped INSERT policy - only founders can insert pricing history
CREATE POLICY "Founders can insert pricing history"
ON public.organization_pricing_history
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'founder'::app_role));

-- Security Fix: Restrict organizations INSERT policy
-- Creating an organization should require authentication and proper checks
DROP POLICY IF EXISTS "Authenticated users can create organizations" ON public.organizations;

-- Create a more restrictive policy - any authenticated user can create an org (this is intentional for new user signup)
-- But we need at least a basic check that the user is authenticated
CREATE POLICY "Authenticated users can create organizations"
ON public.organizations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);