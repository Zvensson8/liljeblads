-- P2: idempotency keys, reverse payloads for undo, undone markers

ALTER TABLE public.jarvis_action_log
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS reverse_payload jsonb,
  ADD COLUMN IF NOT EXISTS result_full jsonb,
  ADD COLUMN IF NOT EXISTS undone_at timestamptz,
  ADD COLUMN IF NOT EXISTS undo_of uuid REFERENCES public.jarvis_action_log(id) ON DELETE SET NULL;

-- One successful (non-undone) action per key per user+org
CREATE UNIQUE INDEX IF NOT EXISTS idx_jarvis_action_log_idempotency
  ON public.jarvis_action_log(organization_id, user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND success = true AND undone_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jarvis_action_log_undo_window
  ON public.jarvis_action_log(user_id, organization_id, created_at DESC)
  WHERE success = true AND undone_at IS NULL AND reverse_payload IS NOT NULL;

COMMENT ON COLUMN public.jarvis_action_log.idempotency_key IS
  'Client/request key to dedupe double-click / retries within org+user';
COMMENT ON COLUMN public.jarvis_action_log.reverse_payload IS
  'Instructions to reverse the action within the undo window';
COMMENT ON COLUMN public.jarvis_action_log.result_full IS
  'Full tool result for idempotent replay';
COMMENT ON COLUMN public.jarvis_action_log.undone_at IS
  'When this action was undone (null = still active)';
