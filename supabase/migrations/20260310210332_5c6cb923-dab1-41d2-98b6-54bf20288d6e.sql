
-- =====================================================
-- FIX 1: audit_logs - scope org admin reads to own org
-- =====================================================

-- Drop the overly permissive org admin policy
DROP POLICY IF EXISTS "Organization admins can view their org's audit logs" ON public.audit_logs;

-- Recreate with proper org scoping: join audit_logs.user_id -> profiles.organization_id
CREATE POLICY "Organization admins can view their org's audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles admin_profile
    JOIN profiles log_profile ON log_profile.organization_id = admin_profile.organization_id
    WHERE admin_profile.id = auth.uid()
    AND log_profile.id = audit_logs.user_id
    AND admin_profile.organization_id IS NOT NULL
    AND (
      has_organization_role(auth.uid(), admin_profile.organization_id, 'owner')
      OR has_organization_role(auth.uid(), admin_profile.organization_id, 'admin')
    )
  )
);

-- =====================================================
-- FIX 2: property_todos - add user_id, fix NULL bypass
-- =====================================================

-- Add user_id column
ALTER TABLE public.property_todos ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill: set user_id for existing todos using the property owner or first org member
UPDATE public.property_todos pt
SET user_id = (
  SELECT COALESCE(
    p.owner_id,
    (SELECT om.user_id FROM organization_members om WHERE om.organization_id = p.organization_id LIMIT 1)
  )
  FROM properties p WHERE p.id = pt.property_id
)
WHERE pt.user_id IS NULL AND pt.property_id IS NOT NULL;

-- For orphan todos (property_id IS NULL), assign to the first user in profiles
UPDATE public.property_todos pt
SET user_id = (SELECT id FROM profiles ORDER BY created_at ASC LIMIT 1)
WHERE pt.user_id IS NULL AND pt.property_id IS NULL;

-- Drop all existing policies
DROP POLICY IF EXISTS "Authenticated users can view todos" ON public.property_todos;
DROP POLICY IF EXISTS "Authenticated users can create todos" ON public.property_todos;
DROP POLICY IF EXISTS "Authenticated users can update todos" ON public.property_todos;
DROP POLICY IF EXISTS "Authenticated users can delete todos" ON public.property_todos;

-- SELECT: own personal todos OR property-scoped todos via org membership
CREATE POLICY "Users can view their own or org todos"
ON public.property_todos
FOR SELECT
TO authenticated
USING (
  (user_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'founder'::app_role)
  OR (
    property_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_todos.property_id
      AND (
        p.owner_id = auth.uid()
        OR user_has_property_assignment(auth.uid(), p.id)
        OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
      )
    )
  )
);

-- INSERT: must set user_id to own id
CREATE POLICY "Users can create their own todos"
ON public.property_todos
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    property_id IS NULL
    OR EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_todos.property_id
      AND (
        p.owner_id = auth.uid()
        OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
      )
    )
  )
);

-- UPDATE: own personal todos or org property todos
CREATE POLICY "Users can update their own or org todos"
ON public.property_todos
FOR UPDATE
TO authenticated
USING (
  (user_id = auth.uid())
  OR (
    property_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_todos.property_id
      AND (
        p.owner_id = auth.uid()
        OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
      )
    )
  )
);

-- DELETE: own personal todos or org property todos
CREATE POLICY "Users can delete their own or org todos"
ON public.property_todos
FOR DELETE
TO authenticated
USING (
  (user_id = auth.uid())
  OR (
    property_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_todos.property_id
      AND (
        p.owner_id = auth.uid()
        OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
      )
    )
  )
);
