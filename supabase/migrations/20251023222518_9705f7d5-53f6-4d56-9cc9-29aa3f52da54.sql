-- Make floor_id nullable and add property_id to components
ALTER TABLE components 
  ALTER COLUMN floor_id DROP NOT NULL;

ALTER TABLE components
  ADD COLUMN property_id uuid REFERENCES properties(id) ON DELETE CASCADE;

-- Update existing components to have property_id from their floor
UPDATE components
SET property_id = floors.property_id
FROM floors
WHERE components.floor_id = floors.id;

-- Make property_id required after backfilling
ALTER TABLE components
  ALTER COLUMN property_id SET NOT NULL;

-- Create index for better query performance
CREATE INDEX idx_components_property_id ON components(property_id);