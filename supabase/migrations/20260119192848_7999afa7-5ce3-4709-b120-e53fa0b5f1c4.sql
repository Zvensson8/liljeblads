-- Drop existing policies on maintenance_history
DROP POLICY IF EXISTS "Users can view maintenance history for their components" ON public.maintenance_history;
DROP POLICY IF EXISTS "Users can create maintenance history for accessible components" ON public.maintenance_history;
DROP POLICY IF EXISTS "Users can update maintenance history for accessible components" ON public.maintenance_history;
DROP POLICY IF EXISTS "Users can delete maintenance history for accessible components" ON public.maintenance_history;

-- Create new policies that use component -> property directly (not via floors)
-- Components always have property_id, but floor_id can be NULL

-- SELECT policy: users can view if they own the property or are admin
CREATE POLICY "Users can view maintenance history for their components"
ON public.maintenance_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM components c
    JOIN properties p ON c.property_id = p.id
    WHERE c.id = maintenance_history.component_id
    AND (
      p.owner_id = auth.uid() 
      OR has_role(auth.uid(), 'admin'::app_role)
      OR is_organization_member(auth.uid(), p.organization_id)
    )
  )
);

-- INSERT policy: users can create if they own the property or are org member
CREATE POLICY "Users can create maintenance history for accessible components"
ON public.maintenance_history
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM components c
    JOIN properties p ON c.property_id = p.id
    WHERE c.id = maintenance_history.component_id
    AND (
      p.owner_id = auth.uid()
      OR is_organization_member(auth.uid(), p.organization_id)
    )
  )
);

-- UPDATE policy
CREATE POLICY "Users can update maintenance history for accessible components"
ON public.maintenance_history
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM components c
    JOIN properties p ON c.property_id = p.id
    WHERE c.id = maintenance_history.component_id
    AND (
      p.owner_id = auth.uid()
      OR is_organization_member(auth.uid(), p.organization_id)
    )
  )
);

-- DELETE policy
CREATE POLICY "Users can delete maintenance history for accessible components"
ON public.maintenance_history
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM components c
    JOIN properties p ON c.property_id = p.id
    WHERE c.id = maintenance_history.component_id
    AND (
      p.owner_id = auth.uid()
      OR is_organization_member(auth.uid(), p.organization_id)
    )
  )
);