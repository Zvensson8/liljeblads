-- Drop the overly restrictive SELECT policy
DROP POLICY IF EXISTS "Financial users can view recurring costs" ON property_recurring_costs;

-- Create a new SELECT policy that allows all organization members to view recurring costs
CREATE POLICY "Organization members can view recurring costs"
ON property_recurring_costs
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role) 
  OR (
    EXISTS (
      SELECT 1
      FROM properties p
      WHERE p.id = property_recurring_costs.property_id
      AND p.organization_id IS NOT NULL
      AND is_organization_member(auth.uid(), p.organization_id)
    )
  )
);