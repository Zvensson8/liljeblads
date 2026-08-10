-- ai_suggested_actions RLS used only profiles.organization_id which breaks
-- multi-org (active org / membership). Scope by membership + platform admin.

DROP POLICY IF EXISTS "Users can view their organization's actions" ON public.ai_suggested_actions;
DROP POLICY IF EXISTS "Users can insert actions for their organization" ON public.ai_suggested_actions;
DROP POLICY IF EXISTS "Users can update their organization's actions" ON public.ai_suggested_actions;
DROP POLICY IF EXISTS "Users can delete their organization's actions" ON public.ai_suggested_actions;

CREATE POLICY "Members can view org AI actions"
ON public.ai_suggested_actions
FOR SELECT
TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.is_organization_member(auth.uid(), organization_id)
);

CREATE POLICY "Members can insert org AI actions"
ON public.ai_suggested_actions
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR public.is_organization_member(auth.uid(), organization_id)
);

CREATE POLICY "Members can update org AI actions"
ON public.ai_suggested_actions
FOR UPDATE
TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.is_organization_member(auth.uid(), organization_id)
)
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR public.is_organization_member(auth.uid(), organization_id)
);

CREATE POLICY "Members can delete org AI actions"
ON public.ai_suggested_actions
FOR DELETE
TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR public.is_organization_member(auth.uid(), organization_id)
);
