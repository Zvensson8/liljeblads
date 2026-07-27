-- Agent / risk suggestion policies per organization

CREATE TABLE IF NOT EXISTS public.organization_agent_policies (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  risk_suggest_enabled boolean NOT NULL DEFAULT true,
  min_risk_level text NOT NULL DEFAULT 'high'
    CHECK (min_risk_level IN ('low', 'medium', 'high', 'critical')),
  min_confidence text NOT NULL DEFAULT 'medium'
    CHECK (min_confidence IN ('low', 'medium', 'high')),
  -- NULL = all types allowed; empty array = none
  included_component_types text[] NULL,
  excluded_component_types text[] NOT NULL DEFAULT '{}',
  max_suggestions_per_run integer NOT NULL DEFAULT 20
    CHECK (max_suggestions_per_run >= 1 AND max_suggestions_per_run <= 100),
  auto_create_work_orders boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_agent_policies_enabled
  ON public.organization_agent_policies(risk_suggest_enabled)
  WHERE risk_suggest_enabled = true;

ALTER TABLE public.organization_agent_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view agent policies" ON public.organization_agent_policies;
CREATE POLICY "Members can view agent policies"
ON public.organization_agent_policies FOR SELECT TO authenticated
USING (
  public.is_organization_member(auth.uid(), organization_id)
  OR public.has_role(auth.uid(), 'founder'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Admins can upsert agent policies" ON public.organization_agent_policies;
CREATE POLICY "Admins can upsert agent policies"
ON public.organization_agent_policies FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = organization_agent_policies.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = organization_agent_policies.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
  )
);

GRANT SELECT, INSERT, UPDATE ON public.organization_agent_policies TO authenticated;
GRANT ALL ON public.organization_agent_policies TO service_role;

COMMENT ON TABLE public.organization_agent_policies IS
  'Policy for predictive risk auto-suggestions and agent autonomy';
