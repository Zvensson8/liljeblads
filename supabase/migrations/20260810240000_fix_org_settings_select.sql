-- Fix: org settings failed for members because organizations SELECT only
-- allowed owner/admin/founder — and organizations_public uses security_invoker
-- so the same RLS applies. Allow any org member (+ platform admin) to read
-- non-sensitive org rows. Sensitive billing stays excluded by the view columns.

DROP POLICY IF EXISTS "Members can view basic org info via view only" ON public.organizations;
CREATE POLICY "Members can view their organizations"
ON public.organizations
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.is_organization_member(auth.uid(), id)
);

-- Secure helper for settings UI (membership-checked, returns public fields)
CREATE OR REPLACE FUNCTION public.get_organization_for_settings(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.organizations%ROWTYPE;
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF NOT public.is_organization_member(v_uid, p_organization_id)
     AND NOT public.is_platform_admin(v_uid) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  SELECT * INTO v_row
  FROM public.organizations
  WHERE id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found';
  END IF;

  SELECT om.role INTO v_role
  FROM public.organization_members om
  WHERE om.user_id = v_uid
    AND om.organization_id = p_organization_id;

  IF v_role IS NULL AND public.is_platform_admin(v_uid) THEN
    v_role := 'founder';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'max_properties', v_row.max_properties,
    'max_users', v_row.max_users,
    'subscription_tier', v_row.subscription_tier,
    'logo_url', v_row.logo_url,
    'primary_color', v_row.primary_color,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at,
    'notes', v_row.notes,
    'member_role', v_role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_for_settings(uuid) TO authenticated;
