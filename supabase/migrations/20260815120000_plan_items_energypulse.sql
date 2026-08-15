-- EnergyPulse actions can land on the maintenance plan without a component.
-- One EP action = one row (source + external_id). Regenerating a Weibull plan
-- reparents those rows instead of copying (see useCreateMaintenancePlan).

ALTER TABLE public.maintenance_plan_items
  ALTER COLUMN component_id DROP NOT NULL;

ALTER TABLE public.maintenance_plan_items
  DROP CONSTRAINT IF EXISTS maintenance_plan_items_plan_id_component_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_maintenance_plan_items_plan_component
  ON public.maintenance_plan_items (plan_id, component_id)
  WHERE component_id IS NOT NULL;

ALTER TABLE public.maintenance_plan_items
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'weibull';

ALTER TABLE public.maintenance_plan_items
  DROP CONSTRAINT IF EXISTS maintenance_plan_items_source_check;

ALTER TABLE public.maintenance_plan_items
  ADD CONSTRAINT maintenance_plan_items_source_check
  CHECK (source IN ('weibull', 'energypulse'));

ALTER TABLE public.maintenance_plan_items
  ADD COLUMN IF NOT EXISTS external_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_maintenance_plan_items_source_external
  ON public.maintenance_plan_items (source, external_id)
  WHERE external_id IS NOT NULL;

COMMENT ON COLUMN public.maintenance_plan_items.source IS
  'weibull = generated from component risk; energypulse = sent from EnergyPulse';
COMMENT ON COLUMN public.maintenance_plan_items.external_id IS
  'Idempotency key. For source=energypulse this is EnergyPulse actions.id.';
