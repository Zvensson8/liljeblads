-- =============================================================================
-- P0 Multi-org isolation
-- 1) Platform admin = founder only (not every org owner)
-- 2) ensure_my_workspace no longer grants global admin to org owners
-- 3) Tenant SELECT policies: remove has_role(admin) global bypass
-- 4) create_organization RPC: org + owner membership atomically
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Platform admin helper (founder-only cross-tenant access)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'founder'::app_role);
$$;

COMMENT ON FUNCTION public.is_platform_admin(uuid) IS
  'True only for platform founders. Org admins use organization_members.role, not user_roles.admin.';

GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. ensure_my_workspace: do NOT grant global admin to non-founders
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_my_workspace(p_org_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_full_name text;
  v_org_id uuid;
  v_member_role text;
  v_is_first boolean;
  v_org_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email, full_name, organization_id
  INTO v_email, v_full_name, v_org_id
  FROM public.profiles
  WHERE id = v_uid;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, email, full_name, role, approved)
    VALUES (
      v_uid,
      COALESCE((SELECT email FROM auth.users WHERE id = v_uid), ''),
      COALESCE((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = v_uid), NULL),
      'user',
      true
    )
    ON CONFLICT (id) DO NOTHING;

    SELECT email, full_name, organization_id
    INTO v_email, v_full_name, v_org_id
    FROM public.profiles
    WHERE id = v_uid;
  END IF;

  -- Already a member of any org?
  SELECT om.organization_id, om.role
  INTO v_org_id, v_member_role
  FROM public.organization_members om
  WHERE om.user_id = v_uid
  LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    UPDATE public.profiles
    SET approved = true,
        organization_id = COALESCE(organization_id, v_org_id)
    WHERE id = v_uid;

    RETURN jsonb_build_object(
      'created', false,
      'organization_id', v_org_id,
      'member_role', v_member_role,
      'roles', (
        SELECT COALESCE(jsonb_agg(ur.role::text), '[]'::jsonb)
        FROM public.user_roles ur WHERE ur.user_id = v_uid
      )
    );
  END IF;

  -- First user in the system becomes founder (platform admin)
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'founder')
  INTO v_is_first;

  v_org_name := NULLIF(trim(p_org_name), '');
  IF v_org_name IS NULL THEN
    v_org_name := COALESCE(
      NULLIF(trim(v_full_name), '') || 's organisation',
      split_part(COALESCE(v_email, 'org'), '@', 1) || ' – Liljeblads',
      'Min organisation'
    );
  END IF;

  INSERT INTO public.organizations (name, max_properties, max_users, subscription_tier)
  VALUES (
    v_org_name,
    CASE WHEN v_is_first THEN 999 ELSE 50 END,
    CASE WHEN v_is_first THEN 100 ELSE 10 END,
    CASE WHEN v_is_first THEN 'enterprise' ELSE 'small' END
  )
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_uid, 'owner');

  UPDATE public.profiles
  SET organization_id = v_org_id,
      approved = true,
      role = CASE WHEN v_is_first THEN 'admin'::user_role ELSE role END
  WHERE id = v_uid;

  IF v_is_first THEN
    -- Platform roles only for the first system user
    INSERT INTO public.user_roles (user_id, role)
    VALUES
      (v_uid, 'founder'::app_role),
      (v_uid, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  -- NOTE: subsequent org owners get organization_members.role = owner only.
  -- They must NOT receive user_roles.admin (that bypasses tenant RLS).

  RETURN jsonb_build_object(
    'created', true,
    'organization_id', v_org_id,
    'member_role', 'owner',
    'is_first_founder', v_is_first,
    'organization_name', v_org_name,
    'roles', (
      SELECT COALESCE(jsonb_agg(ur.role::text), '[]'::jsonb)
      FROM public.user_roles ur WHERE ur.user_id = v_uid
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. create_organization: atomic org + owner membership (no global admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_organization(
  p_name text,
  p_subscription_tier text DEFAULT 'small',
  p_max_properties integer DEFAULT 50,
  p_max_users integer DEFAULT 10,
  p_max_components integer DEFAULT 2500,
  p_max_work_orders integer DEFAULT 5000,
  p_max_projects integer DEFAULT 500,
  p_max_documents integer DEFAULT 10000,
  p_max_storage_mb integer DEFAULT 5120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org_id uuid;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Any authenticated user may create an org they own (membership is created below).
  -- Platform founders use the same path from FounderAdmin.

  v_name := NULLIF(trim(p_name), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Organization name is required';
  END IF;

  INSERT INTO public.organizations (
    name,
    subscription_tier,
    max_properties,
    max_users,
    max_components,
    max_work_orders,
    max_projects,
    max_documents,
    max_storage_mb
  )
  VALUES (
    v_name,
    COALESCE(NULLIF(trim(p_subscription_tier), ''), 'small'),
    COALESCE(p_max_properties, 50),
    COALESCE(p_max_users, 10),
    COALESCE(p_max_components, 2500),
    COALESCE(p_max_work_orders, 5000),
    COALESCE(p_max_projects, 500),
    COALESCE(p_max_documents, 10000),
    COALESCE(p_max_storage_mb, 5120)
  )
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_uid, 'owner')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner';

  -- Point profile default org at the new one (caller can switch later)
  UPDATE public.profiles
  SET organization_id = v_org_id,
      approved = true
  WHERE id = v_uid;

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'name', v_name,
    'member_role', 'owner'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization(
  text, text, integer, integer, integer, integer, integer, integer, integer
) TO authenticated;

COMMENT ON FUNCTION public.create_organization IS
  'Creates organization and adds caller as owner. Does not grant platform user_roles.admin.';

-- ---------------------------------------------------------------------------
-- 4. Strip global admin from tenant SELECT policies (use founder only)
--    Properties / floors / components / work_orders / projects financial view
-- ---------------------------------------------------------------------------

-- properties SELECT
DROP POLICY IF EXISTS "Authenticated org members can view properties" ON public.properties;
CREATE POLICY "Authenticated org members can view properties"
ON public.properties
FOR SELECT
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR public.user_has_property_assignment(auth.uid(), id)
  OR (
    organization_id IS NOT NULL
    AND public.is_organization_member(auth.uid(), organization_id)
  )
);

-- floors SELECT
DROP POLICY IF EXISTS "Authenticated users can view floors" ON public.floors;
CREATE POLICY "Authenticated users can view floors"
ON public.floors
FOR SELECT
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id = floors.property_id
      AND (
        p.owner_id = auth.uid()
        OR public.user_has_property_assignment(auth.uid(), p.id)
        OR (
          p.organization_id IS NOT NULL
          AND public.is_organization_member(auth.uid(), p.organization_id)
        )
      )
  )
);

-- components SELECT
DROP POLICY IF EXISTS "Authenticated users can view components" ON public.components;
CREATE POLICY "Authenticated users can view components"
ON public.components
FOR SELECT
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR (
    floor_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.floors f
      JOIN public.properties p ON f.property_id = p.id
      WHERE f.id = components.floor_id
        AND (
          p.owner_id = auth.uid()
          OR public.user_has_property_assignment(auth.uid(), p.id)
          OR (
            p.organization_id IS NOT NULL
            AND public.is_organization_member(auth.uid(), p.organization_id)
          )
        )
    )
  )
  OR (
    floor_id IS NULL
    AND property_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = components.property_id
        AND (
          p.owner_id = auth.uid()
          OR public.user_has_property_assignment(auth.uid(), p.id)
          OR (
            p.organization_id IS NOT NULL
            AND public.is_organization_member(auth.uid(), p.organization_id)
          )
        )
    )
  )
);

-- work_orders SELECT (members)
DROP POLICY IF EXISTS "Members can view work orders" ON public.work_orders;
CREATE POLICY "Members can view work orders"
ON public.work_orders
FOR SELECT
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id = work_orders.property_id
      AND (
        p.owner_id = auth.uid()
        OR public.user_has_property_assignment(auth.uid(), p.id)
        OR (
          p.organization_id IS NOT NULL
          AND public.is_organization_member(auth.uid(), p.organization_id)
        )
      )
  )
);

-- work_orders financial SELECT
DROP POLICY IF EXISTS "Financial users can view work order pricing" ON public.work_orders;
CREATE POLICY "Financial users can view work order pricing"
ON public.work_orders
FOR SELECT
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id = work_orders.property_id
      AND p.organization_id IS NOT NULL
      AND public.has_financial_access(auth.uid(), p.organization_id)
  )
);

-- projects financial SELECT
DROP POLICY IF EXISTS "Financial users can view project financial data" ON public.projects;
CREATE POLICY "Financial users can view project financial data"
ON public.projects
FOR SELECT
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.id = projects.property_id
      AND p.organization_id IS NOT NULL
      AND public.has_financial_access(auth.uid(), p.organization_id)
  )
);

-- organizations: "Admins can view all" → founders only
DROP POLICY IF EXISTS "Admins can view all organization info" ON public.organizations;
CREATE POLICY "Platform founders can view all organizations"
ON public.organizations
FOR SELECT
TO public
USING (public.is_platform_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. Cleanup: remove global admin from users who are NOT founders
--    (org owners must not retain platform admin from old bootstrap)
-- ---------------------------------------------------------------------------
DELETE FROM public.user_roles ur
WHERE ur.role = 'admin'::app_role
  AND NOT public.has_role(ur.user_id, 'founder'::app_role);
