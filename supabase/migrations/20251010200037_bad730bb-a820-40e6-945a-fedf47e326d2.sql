-- Add area_sqm to properties for cost per sqm calculations
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS area_sqm NUMERIC;

-- Create cost_budgets table
CREATE TABLE IF NOT EXISTS public.cost_budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID REFERENCES public.properties(id) ON DELETE CASCADE,
  component_id UUID REFERENCES public.components(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  quarter TEXT CHECK (quarter IN ('Q1', 'Q2', 'Q3', 'Q4', 'YEAR')),
  budgeted_amount NUMERIC NOT NULL CHECK (budgeted_amount >= 0),
  alert_threshold_75 BOOLEAN NOT NULL DEFAULT true,
  alert_threshold_90 BOOLEAN NOT NULL DEFAULT true,
  alert_threshold_100 BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT budget_target CHECK (
    (property_id IS NOT NULL AND component_id IS NULL) OR
    (property_id IS NULL AND component_id IS NOT NULL)
  )
);

-- Create cost_alerts table
CREATE TABLE IF NOT EXISTS public.cost_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('budget_exceeded', 'high_cost_component', 'cost_spike', 'maintenance_frequency', 'replacement_recommended')),
  threshold_value NUMERIC,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notification_method TEXT NOT NULL DEFAULT 'email' CHECK (notification_method IN ('email', 'push', 'both')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create component_purchase_info table
CREATE TABLE IF NOT EXISTS public.component_purchase_info (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  component_id UUID NOT NULL REFERENCES public.components(id) ON DELETE CASCADE UNIQUE,
  purchase_cost NUMERIC CHECK (purchase_cost >= 0),
  purchase_date DATE,
  warranty_years INTEGER CHECK (warranty_years >= 0),
  expected_lifespan_years INTEGER CHECK (expected_lifespan_years > 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add new columns to maintenance_history
ALTER TABLE maintenance_history 
ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('acute', 'planned', 'warranty', 'preventive')),
ADD COLUMN IF NOT EXISTS is_warranty BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS expected_cost NUMERIC CHECK (expected_cost >= 0);

-- Enable RLS on new tables
ALTER TABLE public.cost_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.component_purchase_info ENABLE ROW LEVEL SECURITY;

-- RLS policies for cost_budgets
CREATE POLICY "Users can view budgets for accessible properties/components"
ON public.cost_budgets FOR SELECT
USING (
  (property_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = cost_budgets.property_id 
    AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )) OR
  (component_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM components c
    JOIN floors f ON c.floor_id = f.id
    JOIN properties p ON f.property_id = p.id
    WHERE c.id = cost_budgets.component_id 
    AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ))
);

CREATE POLICY "Users can create budgets for accessible properties/components"
ON public.cost_budgets FOR INSERT
WITH CHECK (
  (property_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = cost_budgets.property_id AND p.owner_id = auth.uid()
  )) OR
  (component_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM components c
    JOIN floors f ON c.floor_id = f.id
    JOIN properties p ON f.property_id = p.id
    WHERE c.id = cost_budgets.component_id AND p.owner_id = auth.uid()
  ))
);

CREATE POLICY "Users can update budgets for accessible properties/components"
ON public.cost_budgets FOR UPDATE
USING (
  (property_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = cost_budgets.property_id AND p.owner_id = auth.uid()
  )) OR
  (component_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM components c
    JOIN floors f ON c.floor_id = f.id
    JOIN properties p ON f.property_id = p.id
    WHERE c.id = cost_budgets.component_id AND p.owner_id = auth.uid()
  ))
);

CREATE POLICY "Users can delete budgets for accessible properties/components"
ON public.cost_budgets FOR DELETE
USING (
  (property_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = cost_budgets.property_id AND p.owner_id = auth.uid()
  )) OR
  (component_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM components c
    JOIN floors f ON c.floor_id = f.id
    JOIN properties p ON f.property_id = p.id
    WHERE c.id = cost_budgets.component_id AND p.owner_id = auth.uid()
  ))
);

-- RLS policies for cost_alerts
CREATE POLICY "Users can view their own alerts"
ON public.cost_alerts FOR SELECT
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can create their own alerts"
ON public.cost_alerts FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own alerts"
ON public.cost_alerts FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete their own alerts"
ON public.cost_alerts FOR DELETE
USING (user_id = auth.uid());

-- RLS policies for component_purchase_info
CREATE POLICY "Users can view purchase info for accessible components"
ON public.component_purchase_info FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM components c
    JOIN floors f ON c.floor_id = f.id
    JOIN properties p ON f.property_id = p.id
    WHERE c.id = component_purchase_info.component_id 
    AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "Users can create purchase info for accessible components"
ON public.component_purchase_info FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM components c
    JOIN floors f ON c.floor_id = f.id
    JOIN properties p ON f.property_id = p.id
    WHERE c.id = component_purchase_info.component_id AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can update purchase info for accessible components"
ON public.component_purchase_info FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM components c
    JOIN floors f ON c.floor_id = f.id
    JOIN properties p ON f.property_id = p.id
    WHERE c.id = component_purchase_info.component_id AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can delete purchase info for accessible components"
ON public.component_purchase_info FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM components c
    JOIN floors f ON c.floor_id = f.id
    JOIN properties p ON f.property_id = p.id
    WHERE c.id = component_purchase_info.component_id AND p.owner_id = auth.uid()
  )
);

-- Create triggers for updated_at
CREATE TRIGGER update_cost_budgets_updated_at
BEFORE UPDATE ON public.cost_budgets
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_cost_alerts_updated_at
BEFORE UPDATE ON public.cost_alerts
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_component_purchase_info_updated_at
BEFORE UPDATE ON public.component_purchase_info
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();