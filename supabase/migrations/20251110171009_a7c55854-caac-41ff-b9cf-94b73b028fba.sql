-- Fixa search_path för funktionen (använd CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION update_project_additional_costs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;