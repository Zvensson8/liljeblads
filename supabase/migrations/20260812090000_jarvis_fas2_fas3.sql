-- Fas 2+3: retention helper, org Jarvis settings, glossary, watch rules

-- Soft retention: mark old log rows (cleanup job can delete later)
ALTER TABLE public.jarvis_action_log
  ADD COLUMN IF NOT EXISTS retained_until timestamptz;

COMMENT ON COLUMN public.jarvis_action_log.retained_until IS
  'Optional expiry; default policy 180 days from created_at via job';

-- Org-level Jarvis preferences (briefing on/off, etc.)
CREATE TABLE IF NOT EXISTS public.organization_jarvis_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  daily_briefing_enabled boolean NOT NULL DEFAULT true,
  daily_briefing_roles text[] NOT NULL DEFAULT ARRAY['owner','admin']::text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_jarvis_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view jarvis settings" ON public.organization_jarvis_settings;
CREATE POLICY "Members can view jarvis settings"
ON public.organization_jarvis_settings FOR SELECT TO authenticated
USING (
  public.is_organization_member(auth.uid(), organization_id)
  OR public.has_role(auth.uid(), 'founder'::app_role)
);

DROP POLICY IF EXISTS "Admins can upsert jarvis settings" ON public.organization_jarvis_settings;
CREATE POLICY "Admins can upsert jarvis settings"
ON public.organization_jarvis_settings FOR ALL TO authenticated
USING (
  public.is_organization_member(auth.uid(), organization_id)
)
WITH CHECK (
  public.is_organization_member(auth.uid(), organization_id)
);

GRANT SELECT, INSERT, UPDATE ON public.organization_jarvis_settings TO authenticated;
GRANT ALL ON public.organization_jarvis_settings TO service_role;

-- Org glossary for Jarvis prompt injection
CREATE TABLE IF NOT EXISTS public.organization_glossary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  term text NOT NULL,
  meaning text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, term)
);

CREATE INDEX IF NOT EXISTS idx_organization_glossary_org
  ON public.organization_glossary(organization_id);

ALTER TABLE public.organization_glossary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view glossary" ON public.organization_glossary;
CREATE POLICY "Members can view glossary"
ON public.organization_glossary FOR SELECT TO authenticated
USING (
  public.is_organization_member(auth.uid(), organization_id)
  OR public.has_role(auth.uid(), 'founder'::app_role)
);

DROP POLICY IF EXISTS "Members can manage glossary" ON public.organization_glossary;
CREATE POLICY "Members can manage glossary"
ON public.organization_glossary FOR ALL TO authenticated
USING (public.is_organization_member(auth.uid(), organization_id))
WITH CHECK (public.is_organization_member(auth.uid(), organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_glossary TO authenticated;
GRANT ALL ON public.organization_glossary TO service_role;

-- Watch rules: notify user (via send_to_me path / briefing) when conditions match
CREATE TABLE IF NOT EXISTS public.jarvis_watch_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  rule_type text NOT NULL
    CHECK (rule_type IN ('wo_overdue', 'wo_amount_above', 'high_risk_count', 'pending_ai')),
  threshold numeric,
  enabled boolean NOT NULL DEFAULT true,
  last_fired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jarvis_watch_rules_org
  ON public.jarvis_watch_rules(organization_id, enabled);

ALTER TABLE public.jarvis_watch_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own watch rules" ON public.jarvis_watch_rules;
CREATE POLICY "Users manage own watch rules"
ON public.jarvis_watch_rules FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  AND public.is_organization_member(auth.uid(), organization_id)
)
WITH CHECK (
  user_id = auth.uid()
  AND public.is_organization_member(auth.uid(), organization_id)
);

DROP POLICY IF EXISTS "Members can view org watch rules aggregate" ON public.jarvis_watch_rules;
CREATE POLICY "Members can view org watch rules aggregate"
ON public.jarvis_watch_rules FOR SELECT TO authenticated
USING (public.is_organization_member(auth.uid(), organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jarvis_watch_rules TO authenticated;
GRANT ALL ON public.jarvis_watch_rules TO service_role;

COMMENT ON TABLE public.organization_jarvis_settings IS 'Fas 3: briefing defaults etc.';
COMMENT ON TABLE public.organization_glossary IS 'Fas 3: org terms injected into Jarvis system prompt';
COMMENT ON TABLE public.jarvis_watch_rules IS 'Fas 3: user watch rules for proactive alerts';
