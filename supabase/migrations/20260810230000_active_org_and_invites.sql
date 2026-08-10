-- =============================================================================
-- Active organization + invitation accept flow
-- =============================================================================

-- 1. Active org on profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_organization_id uuid
  REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_active_organization
  ON public.profiles(active_organization_id);

-- Backfill: use membership org (or legacy profiles.organization_id)
UPDATE public.profiles p
SET active_organization_id = COALESCE(
  p.active_organization_id,
  (
    SELECT om.organization_id
    FROM public.organization_members om
    WHERE om.user_id = p.id
    ORDER BY om.joined_at NULLS LAST, om.organization_id
    LIMIT 1
  ),
  p.organization_id
)
WHERE p.active_organization_id IS NULL;

-- 2. Invitation token for accept links
ALTER TABLE public.organization_invitations
  ADD COLUMN IF NOT EXISTS token uuid DEFAULT gen_random_uuid();

UPDATE public.organization_invitations
SET token = gen_random_uuid()
WHERE token IS NULL;

ALTER TABLE public.organization_invitations
  ALTER COLUMN token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_invitations_token
  ON public.organization_invitations(token);

-- Invitee can read invitation by token when email matches their profile email
DROP POLICY IF EXISTS "Invited users can view invitation by token" ON public.organization_invitations;
CREATE POLICY "Invited users can view invitation by token"
ON public.organization_invitations
FOR SELECT
TO authenticated
USING (
  accepted_at IS NULL
  AND expires_at > now()
  AND lower(email) = lower(COALESCE(
    (SELECT email FROM public.profiles WHERE id = auth.uid()),
    (SELECT email FROM auth.users WHERE id = auth.uid())
  ))
);

-- ---------------------------------------------------------------------------
-- get_user_organization_id → prefer active_organization_id if member
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT p.active_organization_id
      FROM public.profiles p
      WHERE p.id = _user_id
        AND p.active_organization_id IS NOT NULL
        AND public.is_organization_member(_user_id, p.active_organization_id)
    ),
    (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = _user_id
      ORDER BY om.joined_at NULLS LAST, om.organization_id
      LIMIT 1
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- set_active_organization
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_active_organization(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  SELECT om.role INTO v_role
  FROM public.organization_members om
  WHERE om.user_id = v_uid
    AND om.organization_id = p_organization_id;

  IF v_role IS NULL THEN
    -- Platform founders may activate any org for support without membership
    IF public.is_platform_admin(v_uid) THEN
      v_role := 'founder';
    ELSE
      RAISE EXCEPTION 'Not a member of this organization';
    END IF;
  END IF;

  UPDATE public.profiles
  SET active_organization_id = p_organization_id,
      organization_id = p_organization_id,
      updated_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'member_role', v_role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_active_organization(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- list_my_organizations
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_organizations()
RETURNS TABLE (
  organization_id uuid,
  name text,
  logo_url text,
  primary_color text,
  member_role text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id AS organization_id,
    o.name,
    o.logo_url,
    o.primary_color,
    om.role AS member_role,
    (o.id = public.get_user_organization_id(auth.uid())) AS is_active
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = auth.uid()
  ORDER BY o.name;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_organizations() TO authenticated;

-- ---------------------------------------------------------------------------
-- get_invitation_by_token (for invite landing before accept)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_row public.organization_invitations%ROWTYPE;
  v_org_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(p.email, u.email) INTO v_email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = v_uid;

  SELECT * INTO v_row
  FROM public.organization_invitations
  WHERE token = p_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF v_row.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation already accepted';
  END IF;

  IF v_row.expires_at < now() THEN
    RAISE EXCEPTION 'Invitation expired';
  END IF;

  IF lower(v_row.email) <> lower(COALESCE(v_email, '')) THEN
    RAISE EXCEPTION 'Invitation email does not match your account';
  END IF;

  SELECT name INTO v_org_name FROM public.organizations WHERE id = v_row.organization_id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'token', v_row.token,
    'organization_id', v_row.organization_id,
    'organization_name', v_org_name,
    'email', v_row.email,
    'role', v_row.role,
    'expires_at', v_row.expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- accept_organization_invitation
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_organization_invitation(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_row public.organization_invitations%ROWTYPE;
  v_org_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(p.email, u.email) INTO v_email
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = v_uid;

  SELECT * INTO v_row
  FROM public.organization_invitations
  WHERE token = p_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;

  IF v_row.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation already accepted';
  END IF;

  IF v_row.expires_at < now() THEN
    RAISE EXCEPTION 'Invitation expired';
  END IF;

  IF lower(v_row.email) <> lower(COALESCE(v_email, '')) THEN
    RAISE EXCEPTION 'Invitation email does not match your account';
  END IF;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_row.organization_id, v_uid, COALESCE(NULLIF(v_row.role, ''), 'member'))
  ON CONFLICT (organization_id, user_id) DO UPDATE
    SET role = EXCLUDED.role;

  UPDATE public.organization_invitations
  SET accepted_at = now()
  WHERE id = v_row.id;

  UPDATE public.profiles
  SET active_organization_id = v_row.organization_id,
      organization_id = v_row.organization_id,
      approved = true,
      updated_at = now()
  WHERE id = v_uid;

  SELECT name INTO v_org_name FROM public.organizations WHERE id = v_row.organization_id;

  RETURN jsonb_build_object(
    'organization_id', v_row.organization_id,
    'organization_name', v_org_name,
    'member_role', COALESCE(NULLIF(v_row.role, ''), 'member')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(uuid) TO authenticated;

-- Keep create_organization / ensure_my_workspace setting active org
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

  v_name := NULLIF(trim(p_name), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Organization name is required';
  END IF;

  INSERT INTO public.organizations (
    name, subscription_tier, max_properties, max_users,
    max_components, max_work_orders, max_projects, max_documents, max_storage_mb
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

  UPDATE public.profiles
  SET organization_id = v_org_id,
      active_organization_id = v_org_id,
      approved = true,
      updated_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'name', v_name,
    'member_role', 'owner'
  );
END;
$$;

-- ensure_my_workspace also sets active_organization_id
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

  SELECT om.organization_id, om.role
  INTO v_org_id, v_member_role
  FROM public.organization_members om
  WHERE om.user_id = v_uid
  LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    UPDATE public.profiles
    SET approved = true,
        organization_id = COALESCE(organization_id, v_org_id),
        active_organization_id = COALESCE(active_organization_id, v_org_id),
        updated_at = now()
    WHERE id = v_uid;

    RETURN jsonb_build_object(
      'created', false,
      'organization_id', COALESCE(
        (SELECT active_organization_id FROM public.profiles WHERE id = v_uid),
        v_org_id
      ),
      'member_role', v_member_role,
      'roles', (
        SELECT COALESCE(jsonb_agg(ur.role::text), '[]'::jsonb)
        FROM public.user_roles ur WHERE ur.user_id = v_uid
      )
    );
  END IF;

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
      active_organization_id = v_org_id,
      approved = true,
      role = CASE WHEN v_is_first THEN 'admin'::user_role ELSE role END,
      updated_at = now()
  WHERE id = v_uid;

  IF v_is_first THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES
      (v_uid, 'founder'::app_role),
      (v_uid, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

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
