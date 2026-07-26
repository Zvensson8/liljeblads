-- Drop existing policies
DROP POLICY IF EXISTS "Users can create geometry for accessible components" ON component_geometry;
DROP POLICY IF EXISTS "Users can delete geometry for accessible components" ON component_geometry;
DROP POLICY IF EXISTS "Users can update geometry for accessible components" ON component_geometry;
DROP POLICY IF EXISTS "Users can view geometry for their components" ON component_geometry;

-- Create new policies that work for components with OR without floor_id
-- The key change: use component.property_id directly instead of requiring floor_id join

CREATE POLICY "Users can view geometry for their components"
ON component_geometry
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM components c
    JOIN properties p ON c.property_id = p.id
    WHERE c.id = component_geometry.component_id
    AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "Users can create geometry for accessible components"
ON component_geometry
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM components c
    JOIN properties p ON c.property_id = p.id
    WHERE c.id = component_geometry.component_id
    AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can update geometry for accessible components"
ON component_geometry
FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1
    FROM components c
    JOIN properties p ON c.property_id = p.id
    WHERE c.id = component_geometry.component_id
    AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can delete geometry for accessible components"
ON component_geometry
FOR DELETE
TO public
USING (
  EXISTS (
    SELECT 1
    FROM components c
    JOIN properties p ON c.property_id = p.id
    WHERE c.id = component_geometry.component_id
    AND p.owner_id = auth.uid()
  )
);