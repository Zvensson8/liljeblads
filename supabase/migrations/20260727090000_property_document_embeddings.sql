-- Fas 2: indexera fastighetsdokument för RAG (Document Brain)

-- Queue trigger for property_documents
CREATE OR REPLACE FUNCTION public.queue_property_document_embedding()
RETURNS TRIGGER
LANGUAGE plpgsql
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
    VALUES ('property_documents', OLD.id, 'delete', org_id);
    RETURN OLD;
  ELSE
    -- Only index latest version
    IF COALESCE(NEW.is_latest, true) = false THEN
      RETURN NEW;
    END IF;

    SELECT p.organization_id INTO org_id
    FROM public.properties p
    WHERE p.id = NEW.property_id;

    INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
    VALUES ('property_documents', NEW.id, lower(TG_OP), org_id);
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS queue_property_document_embedding_trigger ON public.property_documents;
CREATE TRIGGER queue_property_document_embedding_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.property_documents
FOR EACH ROW
EXECUTE FUNCTION public.queue_property_document_embedding();

-- Backfill existing latest documents into the queue
INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
SELECT
  'property_documents',
  pd.id,
  'insert',
  p.organization_id
FROM public.property_documents pd
JOIN public.properties p ON p.id = pd.property_id
WHERE COALESCE(pd.is_latest, true) = true
  AND NOT EXISTS (
    SELECT 1 FROM public.embedding_queue eq
    WHERE eq.source_table = 'property_documents'
      AND eq.source_id = pd.id
      AND eq.processed = false
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.embeddings e
    WHERE e.source_table = 'property_documents'
      AND e.source_id = pd.id
  );

COMMENT ON FUNCTION public.queue_property_document_embedding() IS
  'Queues property_documents for embedding/RAG after upload/update/delete';
