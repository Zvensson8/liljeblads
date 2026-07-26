-- Create organization_pricing_history table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.organization_pricing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  old_tier text,
  new_tier text,
  old_max_properties integer,
  new_max_properties integer,
  old_max_users integer,
  new_max_users integer,
  changed_by uuid,
  changed_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.organization_pricing_history ENABLE ROW LEVEL SECURITY;

-- Founders can view all pricing history
CREATE POLICY "Founders can view all pricing history"
ON public.organization_pricing_history
FOR SELECT
USING (has_role(auth.uid(), 'founder'));

-- System can insert pricing history (trigger)
CREATE POLICY "System can insert pricing history"
ON public.organization_pricing_history
FOR INSERT
WITH CHECK (true);

-- Add founder access to organizations table
CREATE POLICY "Founders can view all organizations"
ON public.organizations
FOR SELECT
USING (has_role(auth.uid(), 'founder'));

CREATE POLICY "Founders can update all organizations"
ON public.organizations
FOR UPDATE
USING (has_role(auth.uid(), 'founder'));

CREATE POLICY "Founders can delete organizations"
ON public.organizations
FOR DELETE
USING (has_role(auth.uid(), 'founder'));

-- Add founder access to organization_members table
CREATE POLICY "Founders can view all members"
ON public.organization_members
FOR SELECT
USING (has_role(auth.uid(), 'founder'));

CREATE POLICY "Founders can manage all members"
ON public.organization_members
FOR ALL
USING (has_role(auth.uid(), 'founder'));