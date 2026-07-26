-- Remove the unique constraint on project_number
-- This allows multiple projects to have the same project number (e.g., "23806", "23806+33")
-- Users can manually add suffixes or modify the number as needed
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_project_number_key;