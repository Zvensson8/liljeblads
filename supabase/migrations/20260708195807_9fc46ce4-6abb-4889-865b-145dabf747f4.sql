
-- 1) component-documents storage policy: require ownership on BOTH branches
DROP POLICY IF EXISTS "Org members can view component documents storage" ON storage.objects;

CREATE POLICY "Org members can view component documents storage"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'component-documents'
  AND (
    EXISTS (
      SELECT 1
      FROM component_documents cd
      JOIN components c ON cd.component_id = c.id
      LEFT JOIN floors f ON c.floor_id = f.id
      LEFT JOIN properties p1 ON f.property_id = p1.id
      LEFT JOIN properties p2 ON c.property_id = p2.id
      WHERE (
        objects.name LIKE ('%/' || cd.id || '%')
        OR objects.name LIKE ('%' || split_part(cd.file_url, '/', -1))
      )
      AND (
        p1.owner_id = auth.uid()
        OR p2.owner_id = auth.uid()
        OR (p1.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p1.organization_id))
        OR (p2.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p2.organization_id))
      )
    )
    OR (storage.foldername(name))[1] = (auth.uid())::text
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'founder'::app_role)
  )
);

-- 2) organization-logos: drop broad SELECT policies (files still reachable via public URL, but bucket listing is denied)
DROP POLICY IF EXISTS "Organization logos are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Public can view organization logos" ON storage.objects;

-- 3) Revoke EXECUTE from anon on all public functions
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Revoke EXECUTE from authenticated on internal trigger/system-only functions
REVOKE EXECUTE ON FUNCTION public.auto_archive_completed_projects() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_complete_parent_todo() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_organization_limits() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_document_version() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.log_organization_pricing_change() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_component_embedding() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_drift_task_embedding() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_maintenance_document_delete() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_maintenance_document_for_embedding() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_maintenance_embedding() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_project_embedding() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_property_embedding() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_todo_embedding() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_work_order_embedding() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_property_info_categories(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_org_property_info() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_component_data_to_task_objects() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_embedding_processing() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_conversation_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_drift_task_on_maintenance_delete() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_drift_task_on_maintenance_insert() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_project_actual_cost() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_project_additional_costs_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_task_planned_count() FROM authenticated;

-- Grant EXECUTE to authenticated for functions the frontend/app legitimately needs
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_organization_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_organization_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_financial_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_organization_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_enabled_modules(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_member_names(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_todo_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_knowledge_base_chunks(extensions.vector, integer, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.semantic_search_ranked(extensions.vector, double precision, integer, uuid, text[], boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_embedding_access(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_property_assignment(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_task_status(integer, integer) TO authenticated;

-- 4) Document that knowledge_base_chunks holds only application-wide non-sensitive reference material
COMMENT ON TABLE public.knowledge_base_chunks IS
  'Application-wide reference content (industry standards, e.g. AFF, ABT 06). Contains no organization-specific or sensitive data; readable by every authenticated user by design.';
