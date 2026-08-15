-- Manual rows + protect human edits from Weibull merge.

ALTER TABLE public.maintenance_plan_items
  DROP CONSTRAINT IF EXISTS maintenance_plan_items_source_check;

ALTER TABLE public.maintenance_plan_items
  ADD CONSTRAINT maintenance_plan_items_source_check
  CHECK (source IN ('weibull', 'energypulse', 'manual'));

ALTER TABLE public.maintenance_plan_items
  ADD COLUMN IF NOT EXISTS user_edited boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.maintenance_plan_items.user_edited IS
  'True after a person edits or dismisses the row. Weibull merge must not overwrite.';

COMMENT ON COLUMN public.maintenance_plan_items.source IS
  'weibull = engine; energypulse = EnergyPulse; manual = typed here (Excel-replacement row).';
