-- Fas 5: multi-tenant performance indexes for hot paths

-- Work orders by property + status (list open WO)
CREATE INDEX IF NOT EXISTS idx_work_orders_property_status_created
  ON public.work_orders(property_id, status, created_at DESC);

-- Projects by property + status
CREATE INDEX IF NOT EXISTS idx_projects_property_status
  ON public.projects(property_id, status);

-- Components by property (non-decommissioned lists)
CREATE INDEX IF NOT EXISTS idx_components_property_status
  ON public.components(property_id, status);

-- Property docs latest by property
CREATE INDEX IF NOT EXISTS idx_property_documents_property_latest_created
  ON public.property_documents(property_id, created_at DESC)
  WHERE COALESCE(is_latest, true) = true;

-- Embedding queue pending (cron)
CREATE INDEX IF NOT EXISTS idx_embedding_queue_pending_created
  ON public.embedding_queue(created_at)
  WHERE processed = false AND error IS NULL;

-- Jarvis action log by org+user (Logg-flik)
CREATE INDEX IF NOT EXISTS idx_jarvis_action_log_org_user_created
  ON public.jarvis_action_log(organization_id, user_id, created_at DESC);

-- Active org lookups
CREATE INDEX IF NOT EXISTS idx_profiles_active_organization_id
  ON public.profiles(active_organization_id)
  WHERE active_organization_id IS NOT NULL;

-- Organization members by user (switcher)
CREATE INDEX IF NOT EXISTS idx_organization_members_user
  ON public.organization_members(user_id);

COMMENT ON INDEX idx_work_orders_property_status_created IS 'Fas 5: hot path list_work_orders';
