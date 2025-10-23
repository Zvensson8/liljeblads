-- Drop existing RLS policies for components
DROP POLICY IF EXISTS "Users can create components in accessible floors" ON components;
DROP POLICY IF EXISTS "Users can view components in their floors" ON components;
DROP POLICY IF EXISTS "Users can update components in accessible floors" ON components;
DROP POLICY IF EXISTS "Users can delete components in accessible floors" ON components;

-- Create new RLS policies that handle both floor-based and property-based access
CREATE POLICY "Users can create components in accessible properties"
ON components FOR INSERT
WITH CHECK (
  -- If floor_id is provided, check access through floor
  (floor_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM floors f
    JOIN properties p ON f.property_id = p.id
    WHERE f.id = components.floor_id 
    AND p.owner_id = auth.uid()
  ))
  OR
  -- If floor_id is NULL, check access directly through property_id
  (floor_id IS NULL AND property_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = components.property_id
    AND p.owner_id = auth.uid()
  ))
);

CREATE POLICY "Users can view components in their properties"
ON components FOR SELECT
USING (
  -- Check access through floor if floor_id exists
  (floor_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM floors f
    JOIN properties p ON f.property_id = p.id
    WHERE f.id = components.floor_id
    AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))
  ))
  OR
  -- Check access directly through property_id if floor_id is NULL
  (floor_id IS NULL AND property_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = components.property_id
    AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))
  ))
);

CREATE POLICY "Users can update components in accessible properties"
ON components FOR UPDATE
USING (
  -- Check access through floor if floor_id exists
  (floor_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM floors f
    JOIN properties p ON f.property_id = p.id
    WHERE f.id = components.floor_id
    AND p.owner_id = auth.uid()
  ))
  OR
  -- Check access directly through property_id if floor_id is NULL
  (floor_id IS NULL AND property_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = components.property_id
    AND p.owner_id = auth.uid()
  ))
);

CREATE POLICY "Users can delete components in accessible properties"
ON components FOR DELETE
USING (
  -- Check access through floor if floor_id exists
  (floor_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM floors f
    JOIN properties p ON f.property_id = p.id
    WHERE f.id = components.floor_id
    AND p.owner_id = auth.uid()
  ))
  OR
  -- Check access directly through property_id if floor_id is NULL
  (floor_id IS NULL AND property_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = components.property_id
    AND p.owner_id = auth.uid()
  ))
);