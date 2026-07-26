-- Create trigger to auto-archive projects when status is set to 'avslutat'
CREATE OR REPLACE FUNCTION auto_archive_completed_projects()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'avslutat' THEN
    NEW.is_archived = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on projects table
DROP TRIGGER IF EXISTS trigger_auto_archive_projects ON projects;
CREATE TRIGGER trigger_auto_archive_projects
  BEFORE INSERT OR UPDATE OF status ON projects
  FOR EACH ROW
  EXECUTE FUNCTION auto_archive_completed_projects();