-- Fix the trigger function to use property_id instead of non-existent component_id
CREATE OR REPLACE FUNCTION public.queue_work_order_embedding()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT p.organization_id INTO org_id
    FROM public.properties p
    WHERE p.id = OLD.property_id;
    
    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('work_orders', OLD.id, lower(TG_OP), org_id);
    RETURN OLD;
  ELSE
    SELECT p.organization_id INTO org_id
    FROM public.properties p
    WHERE p.id = NEW.property_id;
    
    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('work_orders', NEW.id, lower(TG_OP), org_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SET search_path = public;