-- Add new columns to components table for detailed component information
ALTER TABLE components 
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS installation_year integer,
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS serial_number text;

-- Update the supplier column name to manufacturer if needed (optional)
-- Since we're adding a new manufacturer column, we can keep supplier for backwards compatibility
-- or migrate the data. For now, we'll use the new manufacturer column.

COMMENT ON COLUMN components.registration_number IS 'Registration number (Reg.nr)';
COMMENT ON COLUMN components.installation_year IS 'Year of installation';
COMMENT ON COLUMN components.manufacturer IS 'Manufacturer/Tillverkare (e.g., NIBE)';
COMMENT ON COLUMN components.model IS 'Model name/number';
COMMENT ON COLUMN components.serial_number IS 'Serial ID/Serie-ID';