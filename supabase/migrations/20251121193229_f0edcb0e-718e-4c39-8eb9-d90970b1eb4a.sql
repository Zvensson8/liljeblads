-- Create table for user module access control
CREATE TABLE IF NOT EXISTS public.user_module_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_name TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, module_name)
);

-- Enable RLS
ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

-- Users can view their own module access
CREATE POLICY "Users can view their own module access"
ON public.user_module_access
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Org admins and founders can view all module access in their org
CREATE POLICY "Org admins can view member module access"
ON public.user_module_access
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'founder'::app_role) OR
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = user_module_access.user_id
    AND p.organization_id IS NOT NULL
    AND (
      has_organization_role(auth.uid(), p.organization_id, 'owner') OR
      has_organization_role(auth.uid(), p.organization_id, 'admin')
    )
  )
);

-- Org admins and founders can manage module access
CREATE POLICY "Org admins can manage module access"
ON public.user_module_access
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'founder'::app_role) OR
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = user_module_access.user_id
    AND p.organization_id IS NOT NULL
    AND (
      has_organization_role(auth.uid(), p.organization_id, 'owner') OR
      has_organization_role(auth.uid(), p.organization_id, 'admin')
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'founder'::app_role) OR
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = user_module_access.user_id
    AND p.organization_id IS NOT NULL
    AND (
      has_organization_role(auth.uid(), p.organization_id, 'owner') OR
      has_organization_role(auth.uid(), p.organization_id, 'admin')
    )
  )
);

-- Create function to get user's enabled modules
CREATE OR REPLACE FUNCTION public.get_user_enabled_modules(target_user_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    array_agg(module_name) FILTER (WHERE is_enabled = true),
    ARRAY['dashboard', 'properties', 'components', 'work-orders', 'operations', 'projects', 'recurring-costs', 'users', 'organization']::TEXT[]
  )
  FROM user_module_access
  WHERE user_id = target_user_id;
$$;

-- Create index for performance
CREATE INDEX idx_user_module_access_user_id ON public.user_module_access(user_id);
CREATE INDEX idx_user_module_access_module_enabled ON public.user_module_access(user_id, module_name, is_enabled);