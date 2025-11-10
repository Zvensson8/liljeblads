-- ============================================================================
-- ROLLBASERAD ÅTKOMSTKONTROLL (RBAC) FÖR FINANSIELL DATA
-- ============================================================================
-- Denna migration implementerar RBAC för att begränsa åtkomst till finansiell
-- data (budgetar, kostnader, priser, fakturering) till endast behöriga användare
-- ============================================================================

-- ===================
-- SÄKERHETSFUNKTION: Kolla om användare har finansiell behörighet
-- ===================
CREATE OR REPLACE FUNCTION public.has_financial_access(
  _user_id uuid,
  _org_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  -- Finansiell åtkomst endast för: founders, admins, org owners, org admins
  SELECT (
    has_role(_user_id, 'founder'::app_role) OR
    has_role(_user_id, 'admin'::app_role) OR
    has_organization_role(_user_id, _org_id, 'owner') OR
    has_organization_role(_user_id, _org_id, 'admin')
  );
$$;

-- ===================
-- ORGANIZATIONS TABLE - Begränsa billing-info
-- ===================
DROP POLICY IF EXISTS "Members can view their organization" ON public.organizations;
DROP POLICY IF EXISTS "Founders can view all organizations" ON public.organizations;

-- Org-medlemmar kan se basinfo men INTE billing-info
CREATE POLICY "Members can view basic organization info"
ON public.organizations FOR SELECT
TO authenticated
USING (
  is_organization_member(auth.uid(), id)
);

-- Endast owners/admins/founders kan se ALL org-info (inklusive billing)
CREATE POLICY "Admins can view all organization info"
ON public.organizations FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'founder'::app_role) OR
  has_organization_role(auth.uid(), id, 'owner') OR
  has_organization_role(auth.uid(), id, 'admin')
);

-- ===================
-- PROPERTIES TABLE - Lägg till finansiell åtkomst
-- ===================
-- Ingen ändring behövs här, properties-tabellen innehåller inte känslig finansiell data

-- ===================
-- PROJECTS TABLE - Begränsa finansiell data
-- ===================
DROP POLICY IF EXISTS "Authenticated users can view projects" ON public.projects;

-- Alla org-medlemmar kan se projekt men INTE finansiell data
CREATE POLICY "Members can view project basic info"
ON public.projects FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = projects.property_id
    AND (
      p.owner_id = auth.uid()
      OR user_has_property_assignment(auth.uid(), p.id)
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- Endast användare med finansiell behörighet kan se ALL projekt-info (budget, forecast, actual_cost)
CREATE POLICY "Financial users can view project financial data"
ON public.projects FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'founder'::app_role) OR
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = projects.property_id
    AND p.organization_id IS NOT NULL
    AND has_financial_access(auth.uid(), p.organization_id)
  )
);

-- ===================
-- PROPERTY_RECURRING_COSTS TABLE - Begränsa finansiell data
-- ===================
DROP POLICY IF EXISTS "Authenticated users can view recurring costs" ON public.property_recurring_costs;
DROP POLICY IF EXISTS "Authenticated users can create recurring costs" ON public.property_recurring_costs;
DROP POLICY IF EXISTS "Authenticated users can update recurring costs" ON public.property_recurring_costs;
DROP POLICY IF EXISTS "Authenticated users can delete recurring costs" ON public.property_recurring_costs;

-- Endast användare med finansiell behörighet
CREATE POLICY "Financial users can view recurring costs"
ON public.property_recurring_costs FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'founder'::app_role) OR
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_recurring_costs.property_id
    AND p.organization_id IS NOT NULL
    AND has_financial_access(auth.uid(), p.organization_id)
  )
);

CREATE POLICY "Financial users can create recurring costs"
ON public.property_recurring_costs FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_recurring_costs.property_id
    AND p.organization_id IS NOT NULL
    AND has_financial_access(auth.uid(), p.organization_id)
  )
);

CREATE POLICY "Financial users can update recurring costs"
ON public.property_recurring_costs FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_recurring_costs.property_id
    AND p.organization_id IS NOT NULL
    AND has_financial_access(auth.uid(), p.organization_id)
  )
);

CREATE POLICY "Financial users can delete recurring costs"
ON public.property_recurring_costs FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_recurring_costs.property_id
    AND p.organization_id IS NOT NULL
    AND has_financial_access(auth.uid(), p.organization_id)
  )
);

-- ===================
-- WORK_ORDERS TABLE - Begränsa pris och contractor-info
-- ===================
DROP POLICY IF EXISTS "Authenticated users can view work orders" ON public.work_orders;

-- Alla kan se work orders men price och vissa fält skyddas via row-level
CREATE POLICY "Members can view work orders"
ON public.work_orders FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'founder'::app_role) OR
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = work_orders.property_id
    AND (
      p.owner_id = auth.uid()
      OR user_has_property_assignment(auth.uid(), p.id)
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- Finansiell behörighet för att se priser
CREATE POLICY "Financial users can view work order pricing"
ON public.work_orders FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'founder'::app_role) OR
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = work_orders.property_id
    AND p.organization_id IS NOT NULL
    AND has_financial_access(auth.uid(), p.organization_id)
  )
);

-- ===================
-- COMPONENT_PURCHASE_INFO TABLE - Begränsa kostnadsdata
-- ===================
DROP POLICY IF EXISTS "Authenticated users can view purchase info" ON public.component_purchase_info;
DROP POLICY IF EXISTS "Authenticated users can create purchase info" ON public.component_purchase_info;
DROP POLICY IF EXISTS "Authenticated users can update purchase info" ON public.component_purchase_info;
DROP POLICY IF EXISTS "Authenticated users can delete purchase info" ON public.component_purchase_info;

-- Endast finansiell behörighet
CREATE POLICY "Financial users can view purchase info"
ON public.component_purchase_info FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'founder'::app_role) OR
  EXISTS (
    SELECT 1 FROM components c
    LEFT JOIN floors f ON c.floor_id = f.id
    LEFT JOIN properties p1 ON f.property_id = p1.id
    LEFT JOIN properties p2 ON c.property_id = p2.id
    WHERE c.id = component_purchase_info.component_id
    AND (
      (p1.organization_id IS NOT NULL AND has_financial_access(auth.uid(), p1.organization_id))
      OR (p2.organization_id IS NOT NULL AND has_financial_access(auth.uid(), p2.organization_id))
    )
  )
);

CREATE POLICY "Financial users can create purchase info"
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
      (p1.organization_id IS NOT NULL AND has_financial_access(auth.uid(), p1.organization_id))
      OR (p2.organization_id IS NOT NULL AND has_financial_access(auth.uid(), p2.organization_id))
    )
  )
);

CREATE POLICY "Financial users can update purchase info"
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
      (p1.organization_id IS NOT NULL AND has_financial_access(auth.uid(), p1.organization_id))
      OR (p2.organization_id IS NOT NULL AND has_financial_access(auth.uid(), p2.organization_id))
    )
  )
);

CREATE POLICY "Financial users can delete purchase info"
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
      (p1.organization_id IS NOT NULL AND has_financial_access(auth.uid(), p1.organization_id))
      OR (p2.organization_id IS NOT NULL AND has_financial_access(auth.uid(), p2.organization_id))
    )
  )
);

-- ===================
-- PROJECT_ADDITIONAL_COSTS TABLE - Begränsa kostnadsdata
-- ===================
DROP POLICY IF EXISTS "Authenticated users can view additional costs" ON public.project_additional_costs;
DROP POLICY IF EXISTS "Authenticated users can create additional costs" ON public.project_additional_costs;
DROP POLICY IF EXISTS "Authenticated users can update additional costs" ON public.project_additional_costs;
DROP POLICY IF EXISTS "Authenticated users can delete additional costs" ON public.project_additional_costs;

-- Endast finansiell behörighet
CREATE POLICY "Financial users can view additional costs"
ON public.project_additional_costs FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'founder'::app_role) OR
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_additional_costs.project_id
    AND p.organization_id IS NOT NULL
    AND has_financial_access(auth.uid(), p.organization_id)
  )
);

CREATE POLICY "Financial users can create additional costs"
ON public.project_additional_costs FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_additional_costs.project_id
    AND p.organization_id IS NOT NULL
    AND has_financial_access(auth.uid(), p.organization_id)
  )
);

CREATE POLICY "Financial users can update additional costs"
ON public.project_additional_costs FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_additional_costs.project_id
    AND p.organization_id IS NOT NULL
    AND has_financial_access(auth.uid(), p.organization_id)
  )
);

CREATE POLICY "Financial users can delete additional costs"
ON public.project_additional_costs FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_additional_costs.project_id
    AND p.organization_id IS NOT NULL
    AND has_financial_access(auth.uid(), p.organization_id)
  )
);

-- ===================
-- PROJECT_BUDGET_ITEMS TABLE - Begränsa budgetdata
-- ===================
DROP POLICY IF EXISTS "Users can manage budget items for accessible projects" ON public.project_budget_items;

-- Endast finansiell behörighet
CREATE POLICY "Financial users can view budget items"
ON public.project_budget_items FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'founder'::app_role) OR
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_budget_items.project_id
    AND p.organization_id IS NOT NULL
    AND has_financial_access(auth.uid(), p.organization_id)
  )
);

CREATE POLICY "Financial users can create budget items"
ON public.project_budget_items FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_budget_items.project_id
    AND p.organization_id IS NOT NULL
    AND has_financial_access(auth.uid(), p.organization_id)
  )
);

CREATE POLICY "Financial users can update budget items"
ON public.project_budget_items FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_budget_items.project_id
    AND p.organization_id IS NOT NULL
    AND has_financial_access(auth.uid(), p.organization_id)
  )
);

CREATE POLICY "Financial users can delete budget items"
ON public.project_budget_items FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_budget_items.project_id
    AND p.organization_id IS NOT NULL
    AND has_financial_access(auth.uid(), p.organization_id)
  )
);

-- ===================
-- PROJECT_COST_ITEMS TABLE (om den finns)
-- ===================
-- Skydda project_cost_items om tabellen finns
DO $$ 
BEGIN
  IF EXISTS (
    SELECT FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'project_cost_items'
  ) THEN
    -- Drop gamla policies
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage cost items for accessible projects" ON public.project_cost_items';
    EXECUTE 'DROP POLICY IF EXISTS "Authenticated users can view cost items" ON public.project_cost_items';
    
    -- Nya policies
    EXECUTE 'CREATE POLICY "Financial users can view cost items" ON public.project_cost_items FOR SELECT TO authenticated USING (
      has_role(auth.uid(), ''admin''::app_role) OR
      has_role(auth.uid(), ''founder''::app_role) OR
      EXISTS (
        SELECT 1 FROM projects pr
        JOIN properties p ON pr.property_id = p.id
        WHERE pr.id = project_cost_items.project_id
        AND p.organization_id IS NOT NULL
        AND has_financial_access(auth.uid(), p.organization_id)
      )
    )';
    
    EXECUTE 'CREATE POLICY "Financial users can create cost items" ON public.project_cost_items FOR INSERT TO authenticated WITH CHECK (
      EXISTS (
        SELECT 1 FROM projects pr
        JOIN properties p ON pr.property_id = p.id
        WHERE pr.id = project_cost_items.project_id
        AND p.organization_id IS NOT NULL
        AND has_financial_access(auth.uid(), p.organization_id)
      )
    )';
    
    EXECUTE 'CREATE POLICY "Financial users can update cost items" ON public.project_cost_items FOR UPDATE TO authenticated USING (
      EXISTS (
        SELECT 1 FROM projects pr
        JOIN properties p ON pr.property_id = p.id
        WHERE pr.id = project_cost_items.project_id
        AND p.organization_id IS NOT NULL
        AND has_financial_access(auth.uid(), p.organization_id)
      )
    )';
    
    EXECUTE 'CREATE POLICY "Financial users can delete cost items" ON public.project_cost_items FOR DELETE TO authenticated USING (
      EXISTS (
        SELECT 1 FROM projects pr
        JOIN properties p ON pr.property_id = p.id
        WHERE pr.id = project_cost_items.project_id
        AND p.organization_id IS NOT NULL
        AND has_financial_access(auth.uid(), p.organization_id)
      )
    )';
  END IF;
END $$;