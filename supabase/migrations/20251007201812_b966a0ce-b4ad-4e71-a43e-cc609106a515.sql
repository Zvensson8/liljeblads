-- Add UPDATE policy for component_geometry
CREATE POLICY "Users can update geometry for accessible components"
ON component_geometry
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM components c
    JOIN floors f ON c.floor_id = f.id
    JOIN properties p ON f.property_id = p.id
    WHERE c.id = component_geometry.component_id
    AND p.owner_id = auth.uid()
  )
);

-- Add DELETE policy for component_geometry
CREATE POLICY "Users can delete geometry for accessible components"
ON component_geometry
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM components c
    JOIN floors f ON c.floor_id = f.id
    JOIN properties p ON f.property_id = p.id
    WHERE c.id = component_geometry.component_id
    AND p.owner_id = auth.uid()
  )
);