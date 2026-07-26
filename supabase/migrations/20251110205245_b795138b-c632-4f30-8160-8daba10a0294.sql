-- Fix RLS policies for admin_settings and project_checklist_templates

-- First, check if admin_settings table exists and add organization_id if missing
DO $$ 
BEGIN
  -- Add organization_id to admin_settings if it doesn't exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_settings') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'admin_settings' 
                   AND column_name = 'organization_id') THEN
      ALTER TABLE public.admin_settings ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

-- Add organization_id to project_checklist_templates if it doesn't exist
ALTER TABLE public.project_checklist_templates 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Drop existing public policies for admin_settings if they exist
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_settings') THEN
    DROP POLICY IF EXISTS "Everyone can view settings" ON public.admin_settings;
    DROP POLICY IF EXISTS "Public can view admin settings" ON public.admin_settings;
    DROP POLICY IF EXISTS "Anyone can view admin settings" ON public.admin_settings;
  END IF;
END $$;

-- Drop existing public policy for project_checklist_templates
DROP POLICY IF EXISTS "Everyone can view checklist templates" ON public.project_checklist_templates;

-- Create new secure policies for admin_settings
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_settings') THEN
    -- Allow organization members to view settings for their organization
    CREATE POLICY "Users can view settings for their organization"
    ON public.admin_settings
    FOR SELECT
    TO authenticated
    USING (
      organization_id IS NULL OR 
      is_organization_member(auth.uid(), organization_id)
    );

    -- Allow organization admins to manage settings
    CREATE POLICY "Organization admins can manage settings"
    ON public.admin_settings
    FOR ALL
    TO authenticated
    USING (
      has_organization_role(auth.uid(), organization_id, 'owner') OR
      has_organization_role(auth.uid(), organization_id, 'admin') OR
      has_role(auth.uid(), 'admin') OR
      has_role(auth.uid(), 'founder')
    );
  END IF;
END $$;

-- Create new secure policies for project_checklist_templates
-- Allow authenticated users to view templates for their organization
CREATE POLICY "Users can view templates for their organization"
ON public.project_checklist_templates
FOR SELECT
TO authenticated
USING (
  organization_id IS NULL OR 
  is_organization_member(auth.uid(), organization_id)
);

-- Keep existing admin policy but update it
DROP POLICY IF EXISTS "Admins can manage checklist templates" ON public.project_checklist_templates;

CREATE POLICY "Organization admins can manage templates"
ON public.project_checklist_templates
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin') OR 
  has_role(auth.uid(), 'founder') OR
  (organization_id IS NOT NULL AND (
    has_organization_role(auth.uid(), organization_id, 'owner') OR
    has_organization_role(auth.uid(), organization_id, 'admin')
  ))
);