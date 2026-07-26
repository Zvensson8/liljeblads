-- Skapa tabell för återkommande fastighetskostnader
CREATE TABLE IF NOT EXISTS public.property_recurring_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'yearly')),
  category TEXT NOT NULL,
  next_due_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.property_recurring_costs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view recurring costs for their properties"
ON public.property_recurring_costs FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_recurring_costs.property_id
    AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "Users can create recurring costs for their properties"
ON public.property_recurring_costs FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_recurring_costs.property_id
    AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can update recurring costs for their properties"
ON public.property_recurring_costs FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_recurring_costs.property_id
    AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can delete recurring costs for their properties"
ON public.property_recurring_costs FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_recurring_costs.property_id
    AND p.owner_id = auth.uid()
  )
);

-- Trigger för updated_at
CREATE TRIGGER update_property_recurring_costs_updated_at
BEFORE UPDATE ON public.property_recurring_costs
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();