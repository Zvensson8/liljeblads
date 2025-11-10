-- Skapa tabell för tillkommande projektkostnader i simuleringen
CREATE TABLE IF NOT EXISTS public.project_additional_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS policies för project_additional_costs
ALTER TABLE public.project_additional_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view additional costs for accessible projects"
ON public.project_additional_costs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_additional_costs.project_id
    AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "Users can create additional costs for accessible projects"
ON public.project_additional_costs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_additional_costs.project_id
    AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can update additional costs for accessible projects"
ON public.project_additional_costs
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_additional_costs.project_id
    AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can delete additional costs for accessible projects"
ON public.project_additional_costs
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_additional_costs.project_id
    AND p.owner_id = auth.uid()
  )
);

-- Trigger för att uppdatera updated_at
CREATE OR REPLACE FUNCTION update_project_additional_costs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_project_additional_costs_updated_at
  BEFORE UPDATE ON public.project_additional_costs
  FOR EACH ROW
  EXECUTE FUNCTION update_project_additional_costs_updated_at();