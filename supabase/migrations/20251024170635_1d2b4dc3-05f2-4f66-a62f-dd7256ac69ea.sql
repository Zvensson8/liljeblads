-- Make property_id nullable in property_todos to allow todos without a specific property
ALTER TABLE property_todos ALTER COLUMN property_id DROP NOT NULL;