
CREATE INDEX IF NOT EXISTS idx_properties_owner_id ON public.properties (owner_id);
CREATE INDEX IF NOT EXISTS idx_properties_name ON public.properties (name);
CREATE INDEX IF NOT EXISTS idx_work_orders_status_updated_at ON public.work_orders (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_embedding_queue_processed_created ON public.embedding_queue (processed, created_at) WHERE processed = false AND error IS NULL;
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON public.organization_members (user_id);
CREATE INDEX IF NOT EXISTS idx_property_todos_user_completed_due ON public.property_todos (user_id, completed, due_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_history_component_performed ON public.maintenance_history (component_id, performed_date DESC);
