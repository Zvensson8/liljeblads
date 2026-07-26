-- Create maintenance history table
CREATE TABLE public.maintenance_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  component_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  performed_date DATE NOT NULL,
  supplier TEXT,
  cost NUMERIC(10, 2),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.maintenance_history ENABLE ROW LEVEL SECURITY;

-- Create policies for maintenance history
CREATE POLICY "Users can view maintenance history for their components"
ON public.maintenance_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM components c
    JOIN floors f ON c.floor_id = f.id
    JOIN properties p ON f.property_id = p.id
    WHERE c.id = maintenance_history.component_id
    AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "Users can create maintenance history for accessible components"
ON public.maintenance_history
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM components c
    JOIN floors f ON c.floor_id = f.id
    JOIN properties p ON f.property_id = p.id
    WHERE c.id = maintenance_history.component_id
    AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can update maintenance history for accessible components"
ON public.maintenance_history
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM components c
    JOIN floors f ON c.floor_id = f.id
    JOIN properties p ON f.property_id = p.id
    WHERE c.id = maintenance_history.component_id
    AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can delete maintenance history for accessible components"
ON public.maintenance_history
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM components c
    JOIN floors f ON c.floor_id = f.id
    JOIN properties p ON f.property_id = p.id
    WHERE c.id = maintenance_history.component_id
    AND p.owner_id = auth.uid()
  )
);

-- Add foreign key constraint
ALTER TABLE public.maintenance_history
ADD CONSTRAINT maintenance_history_component_id_fkey
FOREIGN KEY (component_id)
REFERENCES public.components(id)
ON DELETE CASCADE;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_maintenance_history_updated_at
BEFORE UPDATE ON public.maintenance_history
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();