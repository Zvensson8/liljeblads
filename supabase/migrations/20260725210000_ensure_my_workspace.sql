-- First-run onboarding: authenticated user without an organization gets
-- a workspace (org + owner membership + approved profile).
-- First system user also receives founder + admin roles.

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
    -- Profile should exist via handle_new_user; create minimal if missing
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

  -- Already a member?
  SELECT om.organization_id, om.role
  INTO v_org_id, v_member_role
  FROM public.organization_members om
  WHERE om.user_id = v_uid
  LIMIT 1;

  IF v_org_id IS NOT NULL THEN
    -- Ensure approved for active members
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

  -- First user in the system becomes founder
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
    INSERT INTO public.user_roles (user_id, role)
    VALUES
      (v_uid, 'founder'::app_role),
      (v_uid, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    -- Org owners get app admin for their workspace tooling (optional soft admin)
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, 'admin'::app_role)
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

GRANT EXECUTE ON FUNCTION public.ensure_my_workspace(text) TO authenticated;

COMMENT ON FUNCTION public.ensure_my_workspace(text) IS
  'Idempotent first-run bootstrap: creates org + owner membership if missing; first user becomes founder.';
