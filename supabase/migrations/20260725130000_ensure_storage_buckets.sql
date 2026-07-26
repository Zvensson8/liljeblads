-- Ensure private/public storage buckets used by the app exist

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('floor-drawings', 'floor-drawings', false, 52428800, NULL),
  ('component-documents', 'component-documents', false, 52428800, NULL),
  ('property-documents', 'property-documents', false, 52428800, NULL),
  ('project-documents', 'project-documents', false, 52428800, NULL),
  ('maintenance-documents', 'maintenance-documents', false, 52428800, NULL),
  ('work-order-files', 'work-order-files', false, 52428800, NULL),
  ('todo-attachments', 'todo-attachments', false, 52428800, NULL),
  ('organization-logos', 'organization-logos', true, 5242880, ARRAY['image/png','image/jpeg','image/webp','image/svg+xml']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = COALESCE(EXCLUDED.file_size_limit, storage.buckets.file_size_limit);
