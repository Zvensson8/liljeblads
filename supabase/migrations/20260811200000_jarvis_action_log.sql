-- Jarvis audit log: every apply_* and send_to_me for trust + support

CREATE TABLE IF NOT EXISTS public.jarvis_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid NULL,
  tool_name text NOT NULL,
  args_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  success boolean NOT NULL DEFAULT true,
  entity_type text,
  entity_id uuid,
  link_hint text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jarvis_action_log_org_created
  ON public.jarvis_action_log(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jarvis_action_log_user_created
  ON public.jarvis_action_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jarvis_action_log_entity
  ON public.jarvis_action_log(entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

ALTER TABLE public.jarvis_action_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view own org jarvis actions" ON public.jarvis_action_log;
CREATE POLICY "Members can view own org jarvis actions"
ON public.jarvis_action_log FOR SELECT TO authenticated
USING (
  public.is_organization_member(auth.uid(), organization_id)
  OR public.has_role(auth.uid(), 'founder'::app_role)
);

-- Inserts only via service_role (edge functions)
GRANT SELECT ON public.jarvis_action_log TO authenticated;
GRANT ALL ON public.jarvis_action_log TO service_role;

COMMENT ON TABLE public.jarvis_action_log IS
  'Audit trail for Jarvis apply_* and send_to_me (who/what/when, org-scoped)';
