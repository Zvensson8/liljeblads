-- Create enum for quarter
CREATE TYPE quarter_type AS ENUM ('Q1', 'Q2', 'Q3', 'Q4');

-- Create enum for task status
CREATE TYPE task_status AS ENUM ('completed', 'remaining', 'missing');

-- Create drift_categories table
CREATE TABLE public.drift_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.drift_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.drift_categories ENABLE ROW LEVEL SECURITY;

-- RLS policies for drift_categories
CREATE POLICY "Users can view categories for their properties"
  ON public.drift_categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = drift_categories.property_id
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Users can create categories for their properties"
  ON public.drift_categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = drift_categories.property_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update categories for their properties"
  ON public.drift_categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = drift_categories.property_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete categories for their properties"
  ON public.drift_categories FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = drift_categories.property_id
      AND p.owner_id = auth.uid()
    )
  );

-- Create drift_tasks table
CREATE TABLE public.drift_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  quarter quarter_type NOT NULL,
  category_id UUID REFERENCES public.drift_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  planned_count INTEGER NOT NULL DEFAULT 0,
  reported_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.drift_tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies for drift_tasks
CREATE POLICY "Users can view tasks for their properties"
  ON public.drift_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = drift_tasks.property_id
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Users can create tasks for their properties"
  ON public.drift_tasks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = drift_tasks.property_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update tasks for their properties"
  ON public.drift_tasks FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = drift_tasks.property_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete tasks for their properties"
  ON public.drift_tasks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = drift_tasks.property_id
      AND p.owner_id = auth.uid()
    )
  );

-- Create drift_task_components junction table
CREATE TABLE public.drift_task_components (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.drift_tasks(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES public.components(id) ON DELETE CASCADE,
  is_reported BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(task_id, component_id)
);

-- Enable RLS
ALTER TABLE public.drift_task_components ENABLE ROW LEVEL SECURITY;

-- RLS policies for drift_task_components
CREATE POLICY "Users can view task components for accessible tasks"
  ON public.drift_task_components FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.drift_tasks dt
      JOIN public.properties p ON dt.property_id = p.id
      WHERE dt.id = drift_task_components.task_id
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Users can create task components for accessible tasks"
  ON public.drift_task_components FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.drift_tasks dt
      JOIN public.properties p ON dt.property_id = p.id
      WHERE dt.id = drift_task_components.task_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update task components for accessible tasks"
  ON public.drift_task_components FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.drift_tasks dt
      JOIN public.properties p ON dt.property_id = p.id
      WHERE dt.id = drift_task_components.task_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete task components for accessible tasks"
  ON public.drift_task_components FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.drift_tasks dt
      JOIN public.properties p ON dt.property_id = p.id
      WHERE dt.id = drift_task_components.task_id
      AND p.owner_id = auth.uid()
    )
  );

-- Create component_service_plans table
CREATE TABLE public.component_service_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  component_id UUID NOT NULL REFERENCES public.components(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.drift_categories(id) ON DELETE CASCADE,
  quarters TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(component_id, category_id)
);

-- Enable RLS
ALTER TABLE public.component_service_plans ENABLE ROW LEVEL SECURITY;

-- RLS policies for component_service_plans
CREATE POLICY "Users can view service plans for accessible components"
  ON public.component_service_plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.components c
      JOIN public.floors f ON c.floor_id = f.id
      JOIN public.properties p ON f.property_id = p.id
      WHERE c.id = component_service_plans.component_id
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Users can create service plans for accessible components"
  ON public.component_service_plans FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.components c
      JOIN public.floors f ON c.floor_id = f.id
      JOIN public.properties p ON f.property_id = p.id
      WHERE c.id = component_service_plans.component_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update service plans for accessible components"
  ON public.component_service_plans FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.components c
      JOIN public.floors f ON c.floor_id = f.id
      JOIN public.properties p ON f.property_id = p.id
      WHERE c.id = component_service_plans.component_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete service plans for accessible components"
  ON public.component_service_plans FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.components c
      JOIN public.floors f ON c.floor_id = f.id
      JOIN public.properties p ON f.property_id = p.id
      WHERE c.id = component_service_plans.component_id
      AND p.owner_id = auth.uid()
    )
  );

-- Add triggers for updated_at
CREATE TRIGGER update_drift_categories_updated_at
  BEFORE UPDATE ON public.drift_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_drift_tasks_updated_at
  BEFORE UPDATE ON public.drift_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_component_service_plans_updated_at
  BEFORE UPDATE ON public.component_service_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create function to calculate task status
CREATE OR REPLACE FUNCTION public.get_task_status(planned INTEGER, reported INTEGER)
RETURNS task_status
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN reported = 0 THEN 'missing'::task_status
    WHEN reported >= planned THEN 'completed'::task_status
    ELSE 'remaining'::task_status
  END;
$$;