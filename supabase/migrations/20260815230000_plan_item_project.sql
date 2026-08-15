-- Plan row → project. Number is filled on the plan; then a project exists.

ALTER TABLE public.maintenance_plan_items
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_plan_items_project
  ON public.maintenance_plan_items(project_id)
  WHERE project_id IS NOT NULL;

ALTER TABLE public.maintenance_plan_items
  DROP CONSTRAINT IF EXISTS maintenance_plan_items_status_check;

ALTER TABLE public.maintenance_plan_items
  ADD CONSTRAINT maintenance_plan_items_status_check
  CHECK (status IN ('planned', 'promoted', 'done', 'skipped'));

COMMENT ON COLUMN public.maintenance_plan_items.project_id IS
  'Set when an external project number is entered on the plan.';
COMMENT ON COLUMN public.maintenance_plan_items.status IS
  'planned = proposal; promoted = has project; done = finished; skipped = dismissed.';
