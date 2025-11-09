-- Förenkla RLS policies för att undvika cirkulära referenser
-- Ta bort och återskapa properties policy med enklare logik

DROP POLICY IF EXISTS "Users can view their organization properties" ON public.properties;

-- Skapa en enklare policy som undviker cirkulära referenser
CREATE POLICY "Users can view their organization properties"
ON public.properties
FOR SELECT
TO authenticated
USING (
  -- Founders och admins kan se allt
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'founder')
  -- Användare kan se fastigheter de är tilldelade
  OR user_has_property_assignment(auth.uid(), id)
  -- Användare kan se fastigheter i sin organisation
  OR (
    organization_id IS NOT NULL 
    AND EXISTS (
      SELECT 1 FROM organization_members 
      WHERE user_id = auth.uid() 
      AND organization_id = properties.organization_id
    )
  )
);

-- Uppdatera work_orders policy för att vara tydligare
DROP POLICY IF EXISTS "Users can view their organization work orders" ON public.work_orders;

CREATE POLICY "Users can view their organization work orders"
ON public.work_orders
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'founder')
  OR EXISTS (
    SELECT 1 FROM properties 
    WHERE properties.id = work_orders.property_id
    AND (
      user_has_property_assignment(auth.uid(), properties.id)
      OR (
        properties.organization_id IS NOT NULL 
        AND EXISTS (
          SELECT 1 FROM organization_members 
          WHERE user_id = auth.uid() 
          AND organization_id = properties.organization_id
        )
      )
    )
  )
);

-- Uppdatera components policy
DROP POLICY IF EXISTS "Users can view their organization components" ON public.components;

CREATE POLICY "Users can view their organization components"
ON public.components
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'founder')
  OR (
    floor_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM floors
      JOIN properties ON properties.id = floors.property_id
      WHERE floors.id = components.floor_id
      AND (
        user_has_property_assignment(auth.uid(), properties.id)
        OR (
          properties.organization_id IS NOT NULL 
          AND EXISTS (
            SELECT 1 FROM organization_members 
            WHERE user_id = auth.uid() 
            AND organization_id = properties.organization_id
          )
        )
      )
    )
  )
  OR (
    property_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = components.property_id
      AND (
        user_has_property_assignment(auth.uid(), properties.id)
        OR (
          properties.organization_id IS NOT NULL 
          AND EXISTS (
            SELECT 1 FROM organization_members 
            WHERE user_id = auth.uid() 
            AND organization_id = properties.organization_id
          )
        )
      )
    )
  )
);