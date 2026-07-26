-- Create enum for work order status
CREATE TYPE work_order_status AS ENUM ('not_started', 'awaiting_quote', 'ordered', 'completed', 'archived');

-- Create enum for work order priority
CREATE TYPE work_order_priority AS ENUM ('low', 'medium', 'high');

-- Create work_orders table
CREATE TABLE public.work_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  status work_order_status NOT NULL DEFAULT 'not_started',
  priority work_order_priority NOT NULL DEFAULT 'medium',
  price NUMERIC,
  contractor TEXT,
  due_date DATE,
  quarter TEXT,
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

-- Create policies for work_orders
CREATE POLICY "Users can view work orders for their properties"
ON public.work_orders
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = work_orders.property_id 
    AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "Users can create work orders for their properties"
ON public.work_orders
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = work_orders.property_id 
    AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can update work orders for their properties"
ON public.work_orders
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = work_orders.property_id 
    AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can delete work orders for their properties"
ON public.work_orders
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = work_orders.property_id 
    AND p.owner_id = auth.uid()
  )
);