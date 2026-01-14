-- Allow the work order embedding trigger to enqueue rows regardless of end-user RLS on embedding_queue
-- We do this by making the trigger function SECURITY DEFINER (runs with function owner's privileges)
-- so it can insert into embedding_queue even when regular users cannot.

CREATE OR REPLACE FUNCTION public.queue_work_order_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Ensure function is not callable by anonymous users directly (hardening)
REVOKE ALL ON FUNCTION public.queue_work_order_embedding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_work_order_embedding() TO authenticated;