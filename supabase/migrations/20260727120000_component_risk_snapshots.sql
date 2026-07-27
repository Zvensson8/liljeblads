-- Risk score history for feedback loop (WO completed, cron, manual)

CREATE TABLE IF NOT EXISTS public.component_risk_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id uuid NOT NULL REFERENCES public.components(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  work_order_id uuid REFERENCES public.work_orders(id) ON DELETE SET NULL,
  risk_score integer NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  confidence text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  recommendation text,
  trigger_source text NOT NULL DEFAULT 'manual'
    CHECK (trigger_source IN ('wo_completed', 'cron', 'manual', 'suggestion_executed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_component_risk_snapshots_component
  ON public.component_risk_snapshots(component_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_component_risk_snapshots_org
  ON public.component_risk_snapshots(organization_id, created_at DESC);

ALTER TABLE public.component_risk_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view risk snapshots" ON public.component_risk_snapshots;
CREATE POLICY "Members can view risk snapshots"
ON public.component_risk_snapshots FOR SELECT TO authenticated
USING (
  organization_id IS NULL
  OR public.is_organization_member(auth.uid(), organization_id)
  OR public.has_role(auth.uid(), 'founder'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Members can insert risk snapshots" ON public.component_risk_snapshots;
CREATE POLICY "Members can insert risk snapshots"
ON public.component_risk_snapshots FOR INSERT TO authenticated
WITH CHECK (
  organization_id IS NULL
  OR public.is_organization_member(auth.uid(), organization_id)
  OR public.has_role(auth.uid(), 'founder'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

GRANT SELECT, INSERT ON public.component_risk_snapshots TO authenticated;
GRANT ALL ON public.component_risk_snapshots TO service_role;

COMMENT ON TABLE public.component_risk_snapshots IS
  'Point-in-time Weibull risk scores (feedback loop + history)';
