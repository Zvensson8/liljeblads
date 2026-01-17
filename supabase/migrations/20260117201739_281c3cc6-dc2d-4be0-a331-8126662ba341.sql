-- Create table for maintenance history documents (service protocols)
CREATE TABLE public.maintenance_history_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  maintenance_history_id UUID NOT NULL REFERENCES public.maintenance_history(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.maintenance_history_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can manage documents for maintenance records they have access to via components
CREATE POLICY "Users can view maintenance documents for their components"
ON public.maintenance_history_documents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM maintenance_history mh
    JOIN components c ON c.id = mh.component_id
    JOIN properties p ON p.id = c.property_id
    WHERE mh.id = maintenance_history_documents.maintenance_history_id
    AND (p.owner_id = auth.uid() OR p.organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ))
  )
);

CREATE POLICY "Users can insert maintenance documents for their components"
ON public.maintenance_history_documents
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM maintenance_history mh
    JOIN components c ON c.id = mh.component_id
    JOIN properties p ON p.id = c.property_id
    WHERE mh.id = maintenance_history_documents.maintenance_history_id
    AND (p.owner_id = auth.uid() OR p.organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ))
  )
);

CREATE POLICY "Users can delete maintenance documents for their components"
ON public.maintenance_history_documents
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM maintenance_history mh
    JOIN components c ON c.id = mh.component_id
    JOIN properties p ON p.id = c.property_id
    WHERE mh.id = maintenance_history_documents.maintenance_history_id
    AND (p.owner_id = auth.uid() OR p.organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    ))
  )
);

-- Create index for faster lookups
CREATE INDEX idx_maintenance_history_documents_maintenance_history_id 
ON public.maintenance_history_documents(maintenance_history_id);

-- Create storage bucket for maintenance documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('maintenance-documents', 'maintenance-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Users can upload maintenance documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'maintenance-documents' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "Users can view maintenance documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'maintenance-documents' AND
  auth.uid() IS NOT NULL
);

CREATE POLICY "Users can delete their maintenance documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'maintenance-documents' AND
  auth.uid() IS NOT NULL
);

-- Add trigger to queue maintenance document content for embedding
CREATE OR REPLACE FUNCTION public.queue_maintenance_document_for_embedding()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Get organization_id from the maintenance history -> component -> property chain
  SELECT p.organization_id INTO v_org_id
  FROM maintenance_history mh
  JOIN components c ON c.id = mh.component_id
  JOIN properties p ON p.id = c.property_id
  WHERE mh.id = NEW.maintenance_history_id;

  INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
  VALUES ('maintenance_history_documents', NEW.id, TG_OP, v_org_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_maintenance_document_change
AFTER INSERT OR UPDATE ON public.maintenance_history_documents
FOR EACH ROW EXECUTE FUNCTION public.queue_maintenance_document_for_embedding();

-- Add trigger for delete
CREATE OR REPLACE FUNCTION public.queue_maintenance_document_delete()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT p.organization_id INTO v_org_id
  FROM maintenance_history mh
  JOIN components c ON c.id = mh.component_id
  JOIN properties p ON p.id = c.property_id
  WHERE mh.id = OLD.maintenance_history_id;

  INSERT INTO public.embedding_queue (source_table, source_id, operation, organization_id)
  VALUES ('maintenance_history_documents', OLD.id, 'DELETE', v_org_id);
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_maintenance_document_delete
BEFORE DELETE ON public.maintenance_history_documents
FOR EACH ROW EXECUTE FUNCTION public.queue_maintenance_document_delete();