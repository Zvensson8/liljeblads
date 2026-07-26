-- Skapa storage bucket för projektdokument
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies för project-documents bucket
CREATE POLICY "Users can view project documents for accessible projects"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'project-documents' AND
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE (storage.foldername(storage.objects.name))[1] = pr.id::text
    AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "Users can upload project documents for accessible projects"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'project-documents' AND
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE (storage.foldername(storage.objects.name))[1] = pr.id::text
    AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can delete project documents for accessible projects"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'project-documents' AND
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE (storage.foldername(storage.objects.name))[1] = pr.id::text
    AND p.owner_id = auth.uid()
  )
);