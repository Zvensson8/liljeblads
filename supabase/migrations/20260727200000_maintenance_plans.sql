-- Risk-based predictive maintenance plans (5-year horizon, year+quarter)

CREATE TABLE IF NOT EXISTS public.maintenance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_year integer NOT NULL CHECK (start_year >= 2000 AND start_year <= 2100),
  start_quarter integer NOT NULL CHECK (start_quarter >= 1 AND start_quarter <= 4),
  horizon_years integer NOT NULL DEFAULT 5 CHECK (horizon_years >= 1 AND horizon_years <= 30),
  min_risk_level text NOT NULL DEFAULT 'high'
    CHECK (min_risk_level IN ('low', 'medium', 'high', 'critical')),
  min_confidence text NOT NULL DEFAULT 'medium'
    CHECK (min_confidence IN ('low', 'medium', 'high')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'archived')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_plans_property
  ON public.maintenance_plans(property_id, status, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_maintenance_plans_org
  ON public.maintenance_plans(organization_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS public.maintenance_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.maintenance_plans(id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES public.components(id) ON DELETE CASCADE,
  year integer NOT NULL CHECK (year >= 2000 AND year <= 2100),
  quarter integer NOT NULL CHECK (quarter >= 1 AND quarter <= 4),
  action_type text NOT NULL DEFAULT 'service'
    CHECK (action_type IN ('replace', 'overhaul', 'service', 'inspect')),
  title text NOT NULL,
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_score numeric NOT NULL DEFAULT 0,
  remaining_b10_years numeric,
  confidence text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  estimated_cost numeric CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  cost_source text CHECK (cost_source IS NULL OR cost_source IN ('purchase_info', 'unit_price', 'manual')),
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'done', 'skipped')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, component_id)
);

CREATE INDEX IF NOT EXISTS idx_maintenance_plan_items_plan_yq
  ON public.maintenance_plan_items(plan_id, year, quarter);

CREATE INDEX IF NOT EXISTS idx_maintenance_plan_items_component
  ON public.maintenance_plan_items(component_id);

-- Áprislista (schema ready; UI in later phase)
CREATE TABLE IF NOT EXISTS public.component_unit_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  component_type text NOT NULL,
  label text NOT NULL,
  replacement_cost numeric NOT NULL CHECK (replacement_cost >= 0),
  service_cost numeric CHECK (service_cost IS NULL OR service_cost >= 0),
  currency text NOT NULL DEFAULT 'SEK',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, component_type)
);

CREATE INDEX IF NOT EXISTS idx_component_unit_prices_org
  ON public.component_unit_prices(organization_id)
  WHERE is_active = true;

-- RLS
ALTER TABLE public.maintenance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.component_unit_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view maintenance plans" ON public.maintenance_plans;
CREATE POLICY "Members can view maintenance plans"
ON public.maintenance_plans FOR SELECT TO authenticated
USING (
  public.is_organization_member(auth.uid(), organization_id)
  OR public.has_role(auth.uid(), 'founder'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Members can insert maintenance plans" ON public.maintenance_plans;
CREATE POLICY "Members can insert maintenance plans"
ON public.maintenance_plans FOR INSERT TO authenticated
WITH CHECK (
  public.is_organization_member(auth.uid(), organization_id)
  OR public.has_role(auth.uid(), 'founder'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Members can update maintenance plans" ON public.maintenance_plans;
CREATE POLICY "Members can update maintenance plans"
ON public.maintenance_plans FOR UPDATE TO authenticated
USING (
  public.is_organization_member(auth.uid(), organization_id)
  OR public.has_role(auth.uid(), 'founder'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  public.is_organization_member(auth.uid(), organization_id)
  OR public.has_role(auth.uid(), 'founder'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Members can delete maintenance plans" ON public.maintenance_plans;
CREATE POLICY "Members can delete maintenance plans"
ON public.maintenance_plans FOR DELETE TO authenticated
USING (
  public.is_organization_member(auth.uid(), organization_id)
  OR public.has_role(auth.uid(), 'founder'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Members can view plan items" ON public.maintenance_plan_items;
CREATE POLICY "Members can view plan items"
ON public.maintenance_plan_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.maintenance_plans mp
    WHERE mp.id = maintenance_plan_items.plan_id
      AND (
        public.is_organization_member(auth.uid(), mp.organization_id)
        OR public.has_role(auth.uid(), 'founder'::app_role)
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

DROP POLICY IF EXISTS "Members can insert plan items" ON public.maintenance_plan_items;
CREATE POLICY "Members can insert plan items"
ON public.maintenance_plan_items FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.maintenance_plans mp
    WHERE mp.id = maintenance_plan_items.plan_id
      AND (
        public.is_organization_member(auth.uid(), mp.organization_id)
        OR public.has_role(auth.uid(), 'founder'::app_role)
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

DROP POLICY IF EXISTS "Members can update plan items" ON public.maintenance_plan_items;
CREATE POLICY "Members can update plan items"
ON public.maintenance_plan_items FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.maintenance_plans mp
    WHERE mp.id = maintenance_plan_items.plan_id
      AND (
        public.is_organization_member(auth.uid(), mp.organization_id)
        OR public.has_role(auth.uid(), 'founder'::app_role)
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.maintenance_plans mp
    WHERE mp.id = maintenance_plan_items.plan_id
      AND (
        public.is_organization_member(auth.uid(), mp.organization_id)
        OR public.has_role(auth.uid(), 'founder'::app_role)
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

DROP POLICY IF EXISTS "Members can delete plan items" ON public.maintenance_plan_items;
CREATE POLICY "Members can delete plan items"
ON public.maintenance_plan_items FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.maintenance_plans mp
    WHERE mp.id = maintenance_plan_items.plan_id
      AND (
        public.is_organization_member(auth.uid(), mp.organization_id)
        OR public.has_role(auth.uid(), 'founder'::app_role)
        OR public.has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

DROP POLICY IF EXISTS "Members can view unit prices" ON public.component_unit_prices;
CREATE POLICY "Members can view unit prices"
ON public.component_unit_prices FOR SELECT TO authenticated
USING (
  public.is_organization_member(auth.uid(), organization_id)
  OR public.has_role(auth.uid(), 'founder'::app_role)
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

DROP POLICY IF EXISTS "Admins can manage unit prices" ON public.component_unit_prices;
CREATE POLICY "Admins can manage unit prices"
ON public.component_unit_prices FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = component_unit_prices.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = component_unit_prices.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('admin', 'owner')
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_plan_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.component_unit_prices TO authenticated;
GRANT ALL ON public.maintenance_plans TO service_role;
GRANT ALL ON public.maintenance_plan_items TO service_role;
GRANT ALL ON public.component_unit_prices TO service_role;

COMMENT ON TABLE public.maintenance_plans IS
  'Risk-based predictive maintenance plan headers (start quarter + horizon)';
COMMENT ON TABLE public.maintenance_plan_items IS
  'Plan actions scheduled by year and quarter from Weibull risk';
COMMENT ON TABLE public.component_unit_prices IS
  'Organization unit price list (ápris) by component type for plan cost estimates';
