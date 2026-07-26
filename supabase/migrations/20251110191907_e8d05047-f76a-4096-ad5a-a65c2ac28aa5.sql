-- Add "Specifik energianvändning" field to Miljö & energi category
-- First, we need to find the category_id for "Miljö & energi" and add the field
-- This will be handled by the application after migration

-- Create property_energy_history table for tracking energy declaration changes
CREATE TABLE IF NOT EXISTS public.property_energy_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  energy_grade TEXT,
  primary_energy_number NUMERIC,
  specific_energy_use NUMERIC,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on property_energy_history
ALTER TABLE public.property_energy_history ENABLE ROW LEVEL SECURITY;

-- Users can view energy history for properties they own or are members of their organization
CREATE POLICY "Users can view energy history for accessible properties"
ON public.property_energy_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_energy_history.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  )
);

-- Users can insert energy history for properties they own or are members of their organization
CREATE POLICY "Users can insert energy history for accessible properties"
ON public.property_energy_history
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_energy_history.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_property_energy_history_property_id 
ON public.property_energy_history(property_id);

CREATE INDEX IF NOT EXISTS idx_property_energy_history_recorded_at 
ON public.property_energy_history(property_id, recorded_at DESC);