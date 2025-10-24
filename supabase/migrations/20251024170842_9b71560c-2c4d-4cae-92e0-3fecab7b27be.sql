-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Users can create todos for accessible properties" ON property_todos;

-- Create new INSERT policy that allows todos without property_id
CREATE POLICY "Users can create todos for accessible properties" 
ON property_todos 
FOR INSERT 
WITH CHECK (
  property_id IS NULL OR 
  EXISTS (
    SELECT 1
    FROM properties p
    WHERE p.id = property_todos.property_id 
    AND p.owner_id = auth.uid()
  )
);

-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view todos for accessible properties" ON property_todos;

-- Create new SELECT policy that shows todos without property_id
CREATE POLICY "Users can view todos for accessible properties" 
ON property_todos 
FOR SELECT 
USING (
  property_id IS NULL OR
  EXISTS (
    SELECT 1
    FROM properties p
    WHERE p.id = property_todos.property_id 
    AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

-- Drop existing UPDATE policy
DROP POLICY IF EXISTS "Users can update todos for accessible properties" ON property_todos;

-- Create new UPDATE policy
CREATE POLICY "Users can update todos for accessible properties" 
ON property_todos 
FOR UPDATE 
USING (
  property_id IS NULL OR
  EXISTS (
    SELECT 1
    FROM properties p
    WHERE p.id = property_todos.property_id 
    AND p.owner_id = auth.uid()
  )
);

-- Drop existing DELETE policy
DROP POLICY IF EXISTS "Users can delete todos for accessible properties" ON property_todos;

-- Create new DELETE policy
CREATE POLICY "Users can delete todos for accessible properties" 
ON property_todos 
FOR DELETE 
USING (
  property_id IS NULL OR
  EXISTS (
    SELECT 1
    FROM properties p
    WHERE p.id = property_todos.property_id 
    AND p.owner_id = auth.uid()
  )
);