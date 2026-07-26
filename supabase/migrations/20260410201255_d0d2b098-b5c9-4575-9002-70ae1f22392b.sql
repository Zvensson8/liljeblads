-- First, drop the old permissive policy that allowed any authenticated user to upload
DROP POLICY IF EXISTS "Users can upload maintenance documents" ON storage.objects;

-- Fix admin_settings - restrict global settings (organization_id IS NULL) to founders and admins
-- First remove the old policy that allowed any authenticated user to see NULL org settings
DROP POLICY IF EXISTS "Users can view settings for their organization" ON public.admin_settings;

-- Create policy for organization-specific settings - visible to org members
CREATE POLICY "Org members can view their org settings" 
ON public.admin_settings 
FOR SELECT 
TO authenticated 
USING (
  organization_id IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM public.organization_members om 
    WHERE om.user_id = auth.uid() 
    AND om.organization_id = admin_settings.organization_id
  )
);

-- Global settings (organization_id IS NULL) - only visible to founders and admins
CREATE POLICY "Founders and admins can view global settings" 
ON public.admin_settings 
FOR SELECT 
TO authenticated 
USING (
  organization_id IS NULL 
  AND (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'founder')
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin')
  )
);

-- Fix project_activity_log - allow org members to access logs
-- Drop old restrictive policies
DROP POLICY IF EXISTS "Project owners can view activity logs" ON public.project_activity_log;
DROP POLICY IF EXISTS "System can insert activity logs" ON public.project_activity_log;

-- SELECT policy - org members can view activity
CREATE POLICY "Org members can view project activity logs" 
ON public.project_activity_log 
FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.projects proj
    JOIN public.properties p ON p.id = proj.property_id
    JOIN public.organization_members om ON om.organization_id = p.organization_id
    WHERE proj.id = project_activity_log.project_id
    AND om.user_id = auth.uid()
  )
);

-- INSERT policy - org members can create activity logs
CREATE POLICY "Org members can insert project activity logs" 
ON public.project_activity_log 
FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects proj
    JOIN public.properties p ON p.id = proj.property_id
    JOIN public.organization_members om ON om.organization_id = p.organization_id
    WHERE proj.id = project_activity_log.project_id
    AND om.user_id = auth.uid()
  )
);