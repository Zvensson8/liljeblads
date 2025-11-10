-- ============================================================================
-- KOMPLETT SÄKERHETSSTRATEGI - FIX ALLA RLS POLICIES
-- ============================================================================
-- Denna migration fixar säkerhetsproblem genom att:
-- 1. Ändra alla policies från 'public' till 'authenticated'
-- 2. Säkerställa att endast org-medlemmar kan läsa känslig data
-- 3. Ta bort policies som tillåter public access
-- ============================================================================

-- ===================
-- PROFILES TABLE
-- ===================
-- Ta bort gamla policies
DROP POLICY IF EXISTS "Users can view own profile or admin can view all" ON public.profiles;
DROP POLICY IF EXISTS "Founders can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Founders can update all profiles" ON public.profiles;

-- Nya säkra policies för profiles
CREATE POLICY "Authenticated users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Organization members can view profiles in their org"
ON public.profiles FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL 
  AND is_organization_member(auth.uid(), organization_id)
);

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'founder'::app_role));

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins can update any profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'founder'::app_role));

-- ===================
-- ORGANIZATIONS TABLE
-- ===================
DROP POLICY IF EXISTS "Users can view their organization" ON public.organizations;
DROP POLICY IF EXISTS "Founders can view all organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Organization owners can update their organization" ON public.organizations;
DROP POLICY IF EXISTS "Founders can update all organizations" ON public.organizations;
DROP POLICY IF EXISTS "Founders can delete organizations" ON public.organizations;

CREATE POLICY "Members can view their organization"
ON public.organizations FOR SELECT
TO authenticated
USING (is_organization_member(auth.uid(), id));

CREATE POLICY "Founders can view all organizations"
ON public.organizations FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'founder'::app_role));

CREATE POLICY "Authenticated users can create organizations"
ON public.organizations FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Org owners can update their organization"
ON public.organizations FOR UPDATE
TO authenticated
USING (
  has_organization_role(auth.uid(), id, 'owner') 
  OR has_organization_role(auth.uid(), id, 'admin')
  OR has_role(auth.uid(), 'founder'::app_role)
);

CREATE POLICY "Founders can delete organizations"
ON public.organizations FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'founder'::app_role));

-- ===================
-- PROPERTIES TABLE
-- ===================
DROP POLICY IF EXISTS "Users can view their organization properties" ON public.properties;
DROP POLICY IF EXISTS "Users can create properties in their organization" ON public.properties;
DROP POLICY IF EXISTS "Users can update their organization properties" ON public.properties;
DROP POLICY IF EXISTS "Users can delete their organization properties" ON public.properties;

CREATE POLICY "Authenticated org members can view properties"
ON public.properties FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
  OR user_has_property_assignment(auth.uid(), id)
  OR (organization_id IS NOT NULL AND is_organization_member(auth.uid(), organization_id))
);

CREATE POLICY "Authenticated users can create properties"
ON public.properties FOR INSERT
TO authenticated
WITH CHECK (
  organization_id = get_user_organization_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.approved = true
  )
);

CREATE POLICY "Authenticated org members can update properties"
ON public.properties FOR UPDATE
TO authenticated
USING (
  organization_id IS NOT NULL 
  AND is_organization_member(auth.uid(), organization_id)
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.approved = true
  )
);

CREATE POLICY "Authenticated org admins can delete properties"
ON public.properties FOR DELETE
TO authenticated
USING (
  organization_id IS NOT NULL 
  AND (
    has_organization_role(auth.uid(), organization_id, 'owner')
    OR has_organization_role(auth.uid(), organization_id, 'admin')
  )
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.approved = true
  )
);

-- ===================
-- COMPONENTS TABLE
-- ===================
DROP POLICY IF EXISTS "Users can view components in their properties" ON public.components;
DROP POLICY IF EXISTS "Users can view their organization components" ON public.components;
DROP POLICY IF EXISTS "Users can create components in accessible properties" ON public.components;
DROP POLICY IF EXISTS "Users can update components in accessible properties" ON public.components;
DROP POLICY IF EXISTS "Users can delete components in accessible properties" ON public.components;

CREATE POLICY "Authenticated users can view components"
ON public.components FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
  OR (
    floor_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM floors f
      JOIN properties p ON f.property_id = p.id
      WHERE f.id = components.floor_id
      AND (
        p.owner_id = auth.uid()
        OR user_has_property_assignment(auth.uid(), p.id)
        OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
      )
    )
  )
  OR (
    floor_id IS NULL 
    AND property_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = components.property_id
      AND (
        p.owner_id = auth.uid()
        OR user_has_property_assignment(auth.uid(), p.id)
        OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
      )
    )
  )
);

CREATE POLICY "Authenticated users can create components"
ON public.components FOR INSERT
TO authenticated
WITH CHECK (
  (
    floor_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM floors f
      JOIN properties p ON f.property_id = p.id
      WHERE f.id = components.floor_id
      AND (
        p.owner_id = auth.uid()
        OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
      )
    )
  )
  OR (
    floor_id IS NULL 
    AND property_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = components.property_id
      AND (
        p.owner_id = auth.uid()
        OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
      )
    )
  )
);

CREATE POLICY "Authenticated users can update components"
ON public.components FOR UPDATE
TO authenticated
USING (
  (
    floor_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM floors f
      JOIN properties p ON f.property_id = p.id
      WHERE f.id = components.floor_id
      AND (
        p.owner_id = auth.uid()
        OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
      )
    )
  )
  OR (
    floor_id IS NULL 
    AND property_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = components.property_id
      AND (
        p.owner_id = auth.uid()
        OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
      )
    )
  )
);

CREATE POLICY "Authenticated users can delete components"
ON public.components FOR DELETE
TO authenticated
USING (
  (
    floor_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM floors f
      JOIN properties p ON f.property_id = p.id
      WHERE f.id = components.floor_id
      AND (
        p.owner_id = auth.uid()
        OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
      )
    )
  )
  OR (
    floor_id IS NULL 
    AND property_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = components.property_id
      AND (
        p.owner_id = auth.uid()
        OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
      )
    )
  )
);

-- ===================
-- USER_NOTIFICATION_PREFERENCES TABLE
-- ===================
DROP POLICY IF EXISTS "Users can view own preferences" ON public.user_notification_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON public.user_notification_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_notification_preferences;
DROP POLICY IF EXISTS "Users can delete own preferences" ON public.user_notification_preferences;

CREATE POLICY "Authenticated users can view own preferences"
ON public.user_notification_preferences FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can insert own preferences"
ON public.user_notification_preferences FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated users can update own preferences"
ON public.user_notification_preferences FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Authenticated users can delete own preferences"
ON public.user_notification_preferences FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- ===================
-- WORK_ORDERS TABLE
-- ===================
DROP POLICY IF EXISTS "Users can view work orders for their properties" ON public.work_orders;
DROP POLICY IF EXISTS "Users can view their organization work orders" ON public.work_orders;
DROP POLICY IF EXISTS "Users can create work orders for their properties" ON public.work_orders;
DROP POLICY IF EXISTS "Users can update work orders for their properties" ON public.work_orders;
DROP POLICY IF EXISTS "Users can delete work orders for their properties" ON public.work_orders;

CREATE POLICY "Authenticated users can view work orders"
ON public.work_orders FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = work_orders.property_id
    AND (
      p.owner_id = auth.uid()
      OR user_has_property_assignment(auth.uid(), p.id)
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can create work orders"
ON public.work_orders FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = work_orders.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can update work orders"
ON public.work_orders FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = work_orders.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can delete work orders"
ON public.work_orders FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = work_orders.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- ===================
-- PROJECTS TABLE
-- ===================
DROP POLICY IF EXISTS "Users can view projects for accessible properties" ON public.projects;
DROP POLICY IF EXISTS "Users can create projects for accessible properties" ON public.projects;
DROP POLICY IF EXISTS "Users can update projects for accessible properties" ON public.projects;
DROP POLICY IF EXISTS "Users can delete projects for accessible properties" ON public.projects;

CREATE POLICY "Authenticated users can view projects"
ON public.projects FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = projects.property_id
    AND (
      p.owner_id = auth.uid()
      OR user_has_property_assignment(auth.uid(), p.id)
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can create projects"
ON public.projects FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = projects.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can update projects"
ON public.projects FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = projects.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can delete projects"
ON public.projects FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = projects.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- ===================
-- PROPERTY_RECURRING_COSTS TABLE
-- ===================
DROP POLICY IF EXISTS "Users can view recurring costs for their properties" ON public.property_recurring_costs;
DROP POLICY IF EXISTS "Users can create recurring costs for their properties" ON public.property_recurring_costs;
DROP POLICY IF EXISTS "Users can update recurring costs for their properties" ON public.property_recurring_costs;
DROP POLICY IF EXISTS "Users can delete recurring costs for their properties" ON public.property_recurring_costs;

CREATE POLICY "Authenticated users can view recurring costs"
ON public.property_recurring_costs FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_recurring_costs.property_id
    AND (
      p.owner_id = auth.uid()
      OR user_has_property_assignment(auth.uid(), p.id)
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can create recurring costs"
ON public.property_recurring_costs FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_recurring_costs.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can update recurring costs"
ON public.property_recurring_costs FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_recurring_costs.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can delete recurring costs"
ON public.property_recurring_costs FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_recurring_costs.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- ===================
-- PROPERTY_CONTACTS TABLE
-- ===================
DROP POLICY IF EXISTS "Users can view contacts for accessible properties" ON public.property_contacts;
DROP POLICY IF EXISTS "Users can create contacts for accessible properties" ON public.property_contacts;
DROP POLICY IF EXISTS "Users can update contacts for accessible properties" ON public.property_contacts;
DROP POLICY IF EXISTS "Users can delete contacts for accessible properties" ON public.property_contacts;

CREATE POLICY "Authenticated users can view contacts"
ON public.property_contacts FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_contacts.property_id
    AND (
      p.owner_id = auth.uid()
      OR user_has_property_assignment(auth.uid(), p.id)
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can create contacts"
ON public.property_contacts FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_contacts.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can update contacts"
ON public.property_contacts FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_contacts.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can delete contacts"
ON public.property_contacts FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_contacts.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- ===================
-- ORGANIZATION_INVITATIONS TABLE
-- ===================
DROP POLICY IF EXISTS "Users can view invitations for their organization" ON public.organization_invitations;
DROP POLICY IF EXISTS "Organization admins can create invitations" ON public.organization_invitations;
DROP POLICY IF EXISTS "Organization admins can delete invitations" ON public.organization_invitations;

CREATE POLICY "Authenticated org admins can view invitations"
ON public.organization_invitations FOR SELECT
TO authenticated
USING (
  has_organization_role(auth.uid(), organization_id, 'owner')
  OR has_organization_role(auth.uid(), organization_id, 'admin')
  OR has_role(auth.uid(), 'founder'::app_role)
);

CREATE POLICY "Invited users can view their invitation"
ON public.organization_invitations FOR SELECT
TO authenticated
USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "Authenticated org admins can create invitations"
ON public.organization_invitations FOR INSERT
TO authenticated
WITH CHECK (
  has_organization_role(auth.uid(), organization_id, 'owner')
  OR has_organization_role(auth.uid(), organization_id, 'admin')
);

CREATE POLICY "Authenticated org admins can delete invitations"
ON public.organization_invitations FOR DELETE
TO authenticated
USING (
  has_organization_role(auth.uid(), organization_id, 'owner')
  OR has_organization_role(auth.uid(), organization_id, 'admin')
);

-- ===================
-- FIX REMAINING TABLES WITH PUBLIC ROLE
-- ===================

-- FLOORS TABLE
DROP POLICY IF EXISTS "Users can view floors of their properties" ON public.floors;
DROP POLICY IF EXISTS "Users can create floors in their properties" ON public.floors;
DROP POLICY IF EXISTS "Users can update floors in their properties" ON public.floors;
DROP POLICY IF EXISTS "Users can delete floors in their properties" ON public.floors;

CREATE POLICY "Authenticated users can view floors"
ON public.floors FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = floors.property_id
    AND (
      p.owner_id = auth.uid()
      OR user_has_property_assignment(auth.uid(), p.id)
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can create floors"
ON public.floors FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = floors.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can update floors"
ON public.floors FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = floors.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can delete floors"
ON public.floors FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = floors.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- PROPERTY_TODOS TABLE
DROP POLICY IF EXISTS "Users can view todos for accessible properties" ON public.property_todos;
DROP POLICY IF EXISTS "Users can create todos for accessible properties" ON public.property_todos;
DROP POLICY IF EXISTS "Users can update todos for accessible properties" ON public.property_todos;
DROP POLICY IF EXISTS "Users can delete todos for accessible properties" ON public.property_todos;

CREATE POLICY "Authenticated users can view todos"
ON public.property_todos FOR SELECT
TO authenticated
USING (
  property_id IS NULL
  OR has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_todos.property_id
    AND (
      p.owner_id = auth.uid()
      OR user_has_property_assignment(auth.uid(), p.id)
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can create todos"
ON public.property_todos FOR INSERT
TO authenticated
WITH CHECK (
  property_id IS NULL
  OR EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_todos.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can update todos"
ON public.property_todos FOR UPDATE
TO authenticated
USING (
  property_id IS NULL
  OR EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_todos.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can delete todos"
ON public.property_todos FOR DELETE
TO authenticated
USING (
  property_id IS NULL
  OR EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_todos.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- PROPERTY_NOTES TABLE
DROP POLICY IF EXISTS "Users can view notes for accessible properties" ON public.property_notes;
DROP POLICY IF EXISTS "Users can create notes for accessible properties" ON public.property_notes;
DROP POLICY IF EXISTS "Users can update notes for accessible properties" ON public.property_notes;
DROP POLICY IF EXISTS "Users can delete notes for accessible properties" ON public.property_notes;

CREATE POLICY "Authenticated users can view notes"
ON public.property_notes FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_notes.property_id
    AND (
      p.owner_id = auth.uid()
      OR user_has_property_assignment(auth.uid(), p.id)
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can create notes"
ON public.property_notes FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_notes.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can update notes"
ON public.property_notes FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_notes.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can delete notes"
ON public.property_notes FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_notes.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- DRIFT_TASKS TABLE
DROP POLICY IF EXISTS "Users can view tasks for their properties" ON public.drift_tasks;
DROP POLICY IF EXISTS "Users can create tasks for their properties" ON public.drift_tasks;
DROP POLICY IF EXISTS "Users can update tasks for their properties" ON public.drift_tasks;
DROP POLICY IF EXISTS "Users can delete tasks for their properties" ON public.drift_tasks;

CREATE POLICY "Authenticated users can view tasks"
ON public.drift_tasks FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = drift_tasks.property_id
    AND (
      p.owner_id = auth.uid()
      OR user_has_property_assignment(auth.uid(), p.id)
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can create tasks"
ON public.drift_tasks FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = drift_tasks.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can update tasks"
ON public.drift_tasks FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = drift_tasks.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can delete tasks"
ON public.drift_tasks FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = drift_tasks.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- DRIFT_TASK_COMPONENTS TABLE
DROP POLICY IF EXISTS "Users can view task components for accessible tasks" ON public.drift_task_components;
DROP POLICY IF EXISTS "Users can create task components for accessible tasks" ON public.drift_task_components;
DROP POLICY IF EXISTS "Users can update task components for accessible tasks" ON public.drift_task_components;
DROP POLICY IF EXISTS "Users can delete task components for accessible tasks" ON public.drift_task_components;

CREATE POLICY "Authenticated users can view task components"
ON public.drift_task_components FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM drift_tasks dt
    JOIN properties p ON dt.property_id = p.id
    WHERE dt.id = drift_task_components.task_id
    AND (
      p.owner_id = auth.uid()
      OR user_has_property_assignment(auth.uid(), p.id)
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can create task components"
ON public.drift_task_components FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM drift_tasks dt
    JOIN properties p ON dt.property_id = p.id
    WHERE dt.id = drift_task_components.task_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can update task components"
ON public.drift_task_components FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM drift_tasks dt
    JOIN properties p ON dt.property_id = p.id
    WHERE dt.id = drift_task_components.task_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can delete task components"
ON public.drift_task_components FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM drift_tasks dt
    JOIN properties p ON dt.property_id = p.id
    WHERE dt.id = drift_task_components.task_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- DRIFT_CATEGORIES TABLE
DROP POLICY IF EXISTS "Users can view categories for their properties" ON public.drift_categories;
DROP POLICY IF EXISTS "Users can create categories for their properties" ON public.drift_categories;
DROP POLICY IF EXISTS "Users can update categories for their properties" ON public.drift_categories;
DROP POLICY IF EXISTS "Users can delete categories for their properties" ON public.drift_categories;

CREATE POLICY "Authenticated users can view categories"
ON public.drift_categories FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = drift_categories.property_id
    AND (
      p.owner_id = auth.uid()
      OR user_has_property_assignment(auth.uid(), p.id)
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can create categories"
ON public.drift_categories FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = drift_categories.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can update categories"
ON public.drift_categories FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = drift_categories.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can delete categories"
ON public.drift_categories FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = drift_categories.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- WORK_ORDER_FILES TABLE
DROP POLICY IF EXISTS "Users can view files for accessible work orders" ON public.work_order_files;
DROP POLICY IF EXISTS "Users can create files for accessible work orders" ON public.work_order_files;
DROP POLICY IF EXISTS "Users can delete files for accessible work orders" ON public.work_order_files;

CREATE POLICY "Authenticated users can view work order files"
ON public.work_order_files FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM work_orders wo
    JOIN properties p ON wo.property_id = p.id
    WHERE wo.id = work_order_files.work_order_id
    AND (
      p.owner_id = auth.uid()
      OR user_has_property_assignment(auth.uid(), p.id)
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can create work order files"
ON public.work_order_files FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM work_orders wo
    JOIN properties p ON wo.property_id = p.id
    WHERE wo.id = work_order_files.work_order_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can delete work order files"
ON public.work_order_files FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM work_orders wo
    JOIN properties p ON wo.property_id = p.id
    WHERE wo.id = work_order_files.work_order_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- COMPONENT_SERVICE_PLANS TABLE
DROP POLICY IF EXISTS "Users can view service plans for accessible components" ON public.component_service_plans;
DROP POLICY IF EXISTS "Users can create service plans for accessible components" ON public.component_service_plans;
DROP POLICY IF EXISTS "Users can update service plans for accessible components" ON public.component_service_plans;
DROP POLICY IF EXISTS "Users can delete service plans for accessible components" ON public.component_service_plans;

CREATE POLICY "Authenticated users can view service plans"
ON public.component_service_plans FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM components c
    LEFT JOIN floors f ON c.floor_id = f.id
    LEFT JOIN properties p1 ON f.property_id = p1.id
    LEFT JOIN properties p2 ON c.property_id = p2.id
    WHERE c.id = component_service_plans.component_id
    AND (
      p1.owner_id = auth.uid()
      OR p2.owner_id = auth.uid()
      OR (p1.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p1.organization_id))
      OR (p2.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p2.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can create service plans"
ON public.component_service_plans FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM components c
    LEFT JOIN floors f ON c.floor_id = f.id
    LEFT JOIN properties p1 ON f.property_id = p1.id
    LEFT JOIN properties p2 ON c.property_id = p2.id
    WHERE c.id = component_service_plans.component_id
    AND (
      p1.owner_id = auth.uid()
      OR p2.owner_id = auth.uid()
      OR (p1.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p1.organization_id))
      OR (p2.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p2.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can update service plans"
ON public.component_service_plans FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM components c
    LEFT JOIN floors f ON c.floor_id = f.id
    LEFT JOIN properties p1 ON f.property_id = p1.id
    LEFT JOIN properties p2 ON c.property_id = p2.id
    WHERE c.id = component_service_plans.component_id
    AND (
      p1.owner_id = auth.uid()
      OR p2.owner_id = auth.uid()
      OR (p1.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p1.organization_id))
      OR (p2.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p2.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can delete service plans"
ON public.component_service_plans FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM components c
    LEFT JOIN floors f ON c.floor_id = f.id
    LEFT JOIN properties p1 ON f.property_id = p1.id
    LEFT JOIN properties p2 ON c.property_id = p2.id
    WHERE c.id = component_service_plans.component_id
    AND (
      p1.owner_id = auth.uid()
      OR p2.owner_id = auth.uid()
      OR (p1.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p1.organization_id))
      OR (p2.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p2.organization_id))
    )
  )
);

-- COMPONENT_PURCHASE_INFO TABLE
DROP POLICY IF EXISTS "Users can view purchase info for accessible components" ON public.component_purchase_info;
DROP POLICY IF EXISTS "Users can create purchase info for accessible components" ON public.component_purchase_info;
DROP POLICY IF EXISTS "Users can update purchase info for accessible components" ON public.component_purchase_info;
DROP POLICY IF EXISTS "Users can delete purchase info for accessible components" ON public.component_purchase_info;

CREATE POLICY "Authenticated users can view purchase info"
ON public.component_purchase_info FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM components c
    LEFT JOIN floors f ON c.floor_id = f.id
    LEFT JOIN properties p1 ON f.property_id = p1.id
    LEFT JOIN properties p2 ON c.property_id = p2.id
    WHERE c.id = component_purchase_info.component_id
    AND (
      p1.owner_id = auth.uid()
      OR p2.owner_id = auth.uid()
      OR (p1.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p1.organization_id))
      OR (p2.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p2.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can create purchase info"
ON public.component_purchase_info FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM components c
    LEFT JOIN floors f ON c.floor_id = f.id
    LEFT JOIN properties p1 ON f.property_id = p1.id
    LEFT JOIN properties p2 ON c.property_id = p2.id
    WHERE c.id = component_purchase_info.component_id
    AND (
      p1.owner_id = auth.uid()
      OR p2.owner_id = auth.uid()
      OR (p1.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p1.organization_id))
      OR (p2.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p2.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can update purchase info"
ON public.component_purchase_info FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM components c
    LEFT JOIN floors f ON c.floor_id = f.id
    LEFT JOIN properties p1 ON f.property_id = p1.id
    LEFT JOIN properties p2 ON c.property_id = p2.id
    WHERE c.id = component_purchase_info.component_id
    AND (
      p1.owner_id = auth.uid()
      OR p2.owner_id = auth.uid()
      OR (p1.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p1.organization_id))
      OR (p2.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p2.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can delete purchase info"
ON public.component_purchase_info FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM components c
    LEFT JOIN floors f ON c.floor_id = f.id
    LEFT JOIN properties p1 ON f.property_id = p1.id
    LEFT JOIN properties p2 ON c.property_id = p2.id
    WHERE c.id = component_purchase_info.component_id
    AND (
      p1.owner_id = auth.uid()
      OR p2.owner_id = auth.uid()
      OR (p1.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p1.organization_id))
      OR (p2.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p2.organization_id))
    )
  )
);

-- PROJECT_ADDITIONAL_COSTS TABLE
DROP POLICY IF EXISTS "Users can view additional costs for accessible projects" ON public.project_additional_costs;
DROP POLICY IF EXISTS "Users can create additional costs for accessible projects" ON public.project_additional_costs;
DROP POLICY IF EXISTS "Users can update additional costs for accessible projects" ON public.project_additional_costs;
DROP POLICY IF EXISTS "Users can delete additional costs for accessible projects" ON public.project_additional_costs;

CREATE POLICY "Authenticated users can view additional costs"
ON public.project_additional_costs FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_additional_costs.project_id
    AND (
      p.owner_id = auth.uid()
      OR user_has_property_assignment(auth.uid(), p.id)
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can create additional costs"
ON public.project_additional_costs FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_additional_costs.project_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can update additional costs"
ON public.project_additional_costs FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_additional_costs.project_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Authenticated users can delete additional costs"
ON public.project_additional_costs FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_additional_costs.project_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);