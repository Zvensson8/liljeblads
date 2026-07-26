-- Jarvis agent infrastructure: processed files + run log

CREATE TABLE IF NOT EXISTS public.agent_processed_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_file_id text NOT NULL,
  filename text,
  source text NOT NULL DEFAULT 'inbox',
  status text NOT NULL DEFAULT 'processed'
    CHECK (status IN ('processed', 'failed', 'skipped', 'partial')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source, external_file_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_processed_files_org
  ON public.agent_processed_files(organization_id, processed_at DESC);

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_type text NOT NULL DEFAULT 'service_report_ingest',
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_org
  ON public.agent_runs(organization_id, started_at DESC);

ALTER TABLE public.agent_processed_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

-- Org members can read agent status; founders/admins can read all in their scope
DROP POLICY IF EXISTS "Members can view processed files" ON public.agent_processed_files;
CREATE POLICY "Members can view processed files"
ON public.agent_processed_files FOR SELECT TO authenticated
USING (
  public.is_organization_member(auth.uid(), organization_id)
  OR public.has_role(auth.uid(), 'founder'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Members can view agent runs" ON public.agent_runs;
CREATE POLICY "Members can view agent runs"
ON public.agent_runs FOR SELECT TO authenticated
USING (
  organization_id IS NULL
  OR public.is_organization_member(auth.uid(), organization_id)
  OR public.has_role(auth.uid(), 'founder'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Writes go via service_role / edge webhook only
GRANT SELECT ON public.agent_processed_files TO authenticated;
GRANT SELECT ON public.agent_runs TO authenticated;
GRANT ALL ON public.agent_processed_files TO service_role;
GRANT ALL ON public.agent_runs TO service_role;

COMMENT ON TABLE public.agent_processed_files IS 'Idempotency log for Jarvis ingest (replaces Google Sheets Log)';
COMMENT ON TABLE public.agent_runs IS 'Jarvis pipeline run history';
