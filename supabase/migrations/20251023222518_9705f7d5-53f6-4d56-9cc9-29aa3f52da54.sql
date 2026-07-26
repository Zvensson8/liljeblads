-- Make floor_id nullable and add property_id to components
ALTER TABLE components 
  ALTER COLUMN floor_id DROP NOT NULL;

ALTER TABLE components
  ADD COLUMN IF NOT EXISTS property_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'components_property_id_fkey'
  ) THEN
    ALTER TABLE components
      ADD CONSTRAINT components_property_id_fkey
      FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Update existing components to have property_id from their floor
UPDATE components
SET property_id = floors.property_id
FROM floors
WHERE components.floor_id = floors.id
  AND components.property_id IS NULL;

-- Make property_id required after backfilling (only if no nulls remain)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM components WHERE property_id IS NULL) THEN
    ALTER TABLE components ALTER COLUMN property_id SET NOT NULL;
  END IF;
END $$;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_components_property_id ON components(property_id);
