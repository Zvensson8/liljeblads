-- Create component_documents table
CREATE TABLE IF NOT EXISTS public.component_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  component_id UUID NOT NULL REFERENCES public.components(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.component_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies for component_documents
CREATE POLICY "Users can view documents for accessible components"
  ON public.component_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM components c
      JOIN floors f ON c.floor_id = f.id
      JOIN properties p ON f.property_id = p.id
      WHERE c.id = component_documents.component_id
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Users can create documents for accessible components"
  ON public.component_documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM components c
      JOIN floors f ON c.floor_id = f.id
      JOIN properties p ON f.property_id = p.id
      WHERE c.id = component_documents.component_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete documents for accessible components"
  ON public.component_documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM components c
      JOIN floors f ON c.floor_id = f.id
      JOIN properties p ON f.property_id = p.id
      WHERE c.id = component_documents.component_id
      AND p.owner_id = auth.uid()
    )
  );

-- Create component_costs table for tracking operational costs
CREATE TABLE IF NOT EXISTS public.component_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  component_id UUID NOT NULL REFERENCES public.components(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  cost_date DATE NOT NULL,
  category TEXT,
  description TEXT NOT NULL,
  supplier TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.component_costs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for component_costs
CREATE POLICY "Users can view costs for accessible components"
  ON public.component_costs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM components c
      JOIN floors f ON c.floor_id = f.id
      JOIN properties p ON f.property_id = p.id
      WHERE c.id = component_costs.component_id
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Users can create costs for accessible components"
  ON public.component_costs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM components c
      JOIN floors f ON c.floor_id = f.id
      JOIN properties p ON f.property_id = p.id
      WHERE c.id = component_costs.component_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update costs for accessible components"
  ON public.component_costs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM components c
      JOIN floors f ON c.floor_id = f.id
      JOIN properties p ON f.property_id = p.id
      WHERE c.id = component_costs.component_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete costs for accessible components"
  ON public.component_costs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM components c
      JOIN floors f ON c.floor_id = f.id
      JOIN properties p ON f.property_id = p.id
      WHERE c.id = component_costs.component_id
      AND p.owner_id = auth.uid()
    )
  );

-- Add trigger for updated_at
CREATE TRIGGER update_component_costs_updated_at
  BEFORE UPDATE ON public.component_costs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create storage bucket for component documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('component-documents', 'component-documents', false)
ON CONFLICT (id) DO NOTHING;