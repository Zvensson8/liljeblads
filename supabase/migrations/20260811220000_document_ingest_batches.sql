-- P3: track multi-file / zip uploads into property_documents for Jarvis audit

CREATE TABLE IF NOT EXISTS public.document_ingest_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'upload'
    CHECK (source IN ('upload', 'zip', 'folder', 'connector_stub')),
  label text,
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('running', 'completed', 'partial', 'failed')),
  files_total int NOT NULL DEFAULT 0,
  files_ok int NOT NULL DEFAULT 0,
  files_failed int NOT NULL DEFAULT 0,
  document_ids uuid[] NOT NULL DEFAULT '{}',
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_document_ingest_batches_org
  ON public.document_ingest_batches(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_ingest_batches_property
  ON public.document_ingest_batches(property_id, created_at DESC);

ALTER TABLE public.document_ingest_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view ingest batches" ON public.document_ingest_batches;
CREATE POLICY "Members can view ingest batches"
ON public.document_ingest_batches FOR SELECT TO authenticated
USING (
  public.is_organization_member(auth.uid(), organization_id)
  OR public.has_role(auth.uid(), 'founder'::app_role)
);

DROP POLICY IF EXISTS "Members can insert ingest batches" ON public.document_ingest_batches;
CREATE POLICY "Members can insert ingest batches"
ON public.document_ingest_batches FOR INSERT TO authenticated
WITH CHECK (
  public.is_organization_member(auth.uid(), organization_id)
  AND user_id = auth.uid()
);

DROP POLICY IF EXISTS "Members can update own ingest batches" ON public.document_ingest_batches;
CREATE POLICY "Members can update own ingest batches"
ON public.document_ingest_batches FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  AND public.is_organization_member(auth.uid(), organization_id)
);

GRANT SELECT, INSERT, UPDATE ON public.document_ingest_batches TO authenticated;
GRANT ALL ON public.document_ingest_batches TO service_role;

COMMENT ON TABLE public.document_ingest_batches IS
  'P3: multi-file/zip ingest into property_documents (data stays in-system for Jarvis RAG)';
