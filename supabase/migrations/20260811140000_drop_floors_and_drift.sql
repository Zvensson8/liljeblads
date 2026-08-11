-- Fas cleanup: remove floors (incl. drawings) and drift_tasks stack.
-- Components keep property_id + room_zone for placement text only.

-- 1) Drift / operations stack
DROP TABLE IF EXISTS public.drift_task_components CASCADE;
DROP TABLE IF EXISTS public.drift_task_templates CASCADE;
DROP TABLE IF EXISTS public.drift_tasks CASCADE;
DROP TABLE IF EXISTS public.drift_categories CASCADE;

-- Optional scheduled reports (global reports retired)
DROP TABLE IF EXISTS public.scheduled_reports CASCADE;

-- 2) maintenance_history no longer links to drift tasks
ALTER TABLE public.maintenance_history
  DROP COLUMN IF EXISTS drift_task_id;

-- 3) Detach components from floors, then drop floors
ALTER TABLE public.components
  DROP CONSTRAINT IF EXISTS components_floor_id_fkey;

ALTER TABLE public.components
  DROP COLUMN IF EXISTS floor_id;

DROP TABLE IF EXISTS public.floors CASCADE;

-- 4) Storage: floor-drawings bucket (objects + bucket; policies cascade with bucket in some setups)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'floor-drawings') THEN
    DELETE FROM storage.objects WHERE bucket_id = 'floor-drawings';
    DELETE FROM storage.buckets WHERE id = 'floor-drawings';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'floor-drawings storage cleanup skipped: %', SQLERRM;
END $$;
