-- Drop and recreate the check constraint to allow uppercase operations
ALTER TABLE public.embedding_queue DROP CONSTRAINT IF EXISTS embedding_queue_operation_check;

ALTER TABLE public.embedding_queue ADD CONSTRAINT embedding_queue_operation_check 
CHECK (lower(operation) = ANY (ARRAY['insert', 'update', 'delete']));

-- Update existing triggers to use lowercase
CREATE OR REPLACE FUNCTION queue_component_embedding()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT p.organization_id INTO org_id
    FROM public.properties p
    WHERE p.id = OLD.property_id;
    
    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('components', OLD.id, lower(TG_OP), org_id);
    RETURN OLD;
  ELSE
    SELECT p.organization_id INTO org_id
    FROM public.properties p
    WHERE p.id = NEW.property_id;
    
    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('components', NEW.id, lower(TG_OP), org_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION queue_work_order_embedding()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT p.organization_id INTO org_id
    FROM public.properties p
    JOIN public.components c ON c.property_id = p.id
    WHERE c.id = OLD.component_id;
    
    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('work_orders', OLD.id, lower(TG_OP), org_id);
    RETURN OLD;
  ELSE
    SELECT p.organization_id INTO org_id
    FROM public.properties p
    JOIN public.components c ON c.property_id = p.id
    WHERE c.id = NEW.component_id;
    
    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('work_orders', NEW.id, lower(TG_OP), org_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION queue_project_embedding()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT p.organization_id INTO org_id
    FROM public.properties p
    WHERE p.id = OLD.property_id;
    
    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('projects', OLD.id, lower(TG_OP), org_id);
    RETURN OLD;
  ELSE
    SELECT p.organization_id INTO org_id
    FROM public.properties p
    WHERE p.id = NEW.property_id;
    
    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('projects', NEW.id, lower(TG_OP), org_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION queue_todo_embedding()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT p.organization_id INTO org_id
    FROM public.properties p
    WHERE p.id = OLD.property_id;
    
    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('property_todos', OLD.id, lower(TG_OP), org_id);
    RETURN OLD;
  ELSE
    SELECT p.organization_id INTO org_id
    FROM public.properties p
    WHERE p.id = NEW.property_id;
    
    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('property_todos', NEW.id, lower(TG_OP), org_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;