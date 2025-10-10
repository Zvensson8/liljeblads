-- Uppdatera drift_task_components för att stödja objekt utan komponenter
ALTER TABLE public.drift_task_components 
  ALTER COLUMN component_id DROP NOT NULL,
  ADD COLUMN object_name TEXT;

-- Lägg till check constraint: antingen component_id eller object_name måste finnas
ALTER TABLE public.drift_task_components
  ADD CONSTRAINT check_component_or_name 
  CHECK (
    (component_id IS NOT NULL AND object_name IS NULL) OR 
    (component_id IS NULL AND object_name IS NOT NULL)
  );