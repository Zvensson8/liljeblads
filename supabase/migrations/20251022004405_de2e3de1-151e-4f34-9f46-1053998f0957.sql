-- Create project_status enum
CREATE TYPE project_status AS ENUM (
  'planerat',
  'invantar_offert',
  'offert_finns',
  'pagaende',
  'pausat',
  'avslutat'
);

-- Create project_type enum
CREATE TYPE project_type AS ENUM (
  'renovering',
  'underhall',
  'energi',
  'annat'
);

-- Create projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  project_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  type project_type NOT NULL,
  status project_status NOT NULL DEFAULT 'planerat',
  project_manager TEXT,
  actors TEXT[], -- Array of contractors/suppliers
  start_date DATE,
  end_date DATE,
  budget NUMERIC DEFAULT 0,
  forecast NUMERIC DEFAULT 0,
  actual_cost NUMERIC DEFAULT 0,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create project_cost_items table
CREATE TABLE project_cost_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  cost_date DATE NOT NULL,
  actor TEXT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create project_budget_items table
CREATE TABLE project_budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  budgeted_amount NUMERIC NOT NULL,
  forecasted_amount NUMERIC,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create project_documents table
CREATE TABLE project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  folder TEXT DEFAULT 'Allmänt', -- Avtal, Ritningar, Protokoll, Fakturor, Kommunikation, Allmänt
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create project_document_comments table
CREATE TABLE project_document_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create project_checklist_templates table
CREATE TABLE project_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_type project_type NOT NULL,
  items JSONB NOT NULL, -- Array of {title, description, order}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create project_checklist_items table
CREATE TABLE project_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  responsible TEXT,
  deadline DATE,
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id),
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create project_activity_log table
CREATE TABLE project_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL, -- 'status_change', 'budget_update', 'cost_added', 'cost_deleted', 'archived', 'unarchived', 'document_added'
  description TEXT NOT NULL,
  metadata JSONB,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create project_notes table
CREATE TABLE project_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on all tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_cost_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_document_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for projects
CREATE POLICY "Users can view projects for accessible properties"
  ON projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = projects.property_id
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Users can create projects for accessible properties"
  ON projects FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = projects.property_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update projects for accessible properties"
  ON projects FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = projects.property_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete projects for accessible properties"
  ON projects FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = projects.property_id
      AND p.owner_id = auth.uid()
    )
  );

-- RLS Policies for project_cost_items
CREATE POLICY "Users can view costs for accessible projects"
  ON project_cost_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects pr
      JOIN properties p ON pr.property_id = p.id
      WHERE pr.id = project_cost_items.project_id
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Users can create costs for accessible projects"
  ON project_cost_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects pr
      JOIN properties p ON pr.property_id = p.id
      WHERE pr.id = project_cost_items.project_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update costs for accessible projects"
  ON project_cost_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects pr
      JOIN properties p ON pr.property_id = p.id
      WHERE pr.id = project_cost_items.project_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete costs for accessible projects"
  ON project_cost_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects pr
      JOIN properties p ON pr.property_id = p.id
      WHERE pr.id = project_cost_items.project_id
      AND p.owner_id = auth.uid()
    )
  );

-- Similar policies for other tables (budget_items, documents, etc.)
CREATE POLICY "Users can manage budget items for accessible projects"
  ON project_budget_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects pr
      JOIN properties p ON pr.property_id = p.id
      WHERE pr.id = project_budget_items.project_id
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Users can manage documents for accessible projects"
  ON project_documents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects pr
      JOIN properties p ON pr.property_id = p.id
      WHERE pr.id = project_documents.project_id
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Users can manage document comments for accessible projects"
  ON project_document_comments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project_documents pd
      JOIN projects pr ON pd.project_id = pr.id
      JOIN properties p ON pr.property_id = p.id
      WHERE pd.id = project_document_comments.document_id
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Everyone can view checklist templates"
  ON project_checklist_templates FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage checklist templates"
  ON project_checklist_templates FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can manage checklist items for accessible projects"
  ON project_checklist_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects pr
      JOIN properties p ON pr.property_id = p.id
      WHERE pr.id = project_checklist_items.project_id
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Users can view activity log for accessible projects"
  ON project_activity_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects pr
      JOIN properties p ON pr.property_id = p.id
      WHERE pr.id = project_activity_log.project_id
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE POLICY "Users can create activity log for accessible projects"
  ON project_activity_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects pr
      JOIN properties p ON pr.property_id = p.id
      WHERE pr.id = project_activity_log.project_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage notes for accessible projects"
  ON project_notes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects pr
      JOIN properties p ON pr.property_id = p.id
      WHERE pr.id = project_notes.project_id
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

-- Trigger to update actual_cost when cost_items change
CREATE OR REPLACE FUNCTION update_project_actual_cost()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE projects
  SET actual_cost = (
    SELECT COALESCE(SUM(amount), 0)
    FROM project_cost_items
    WHERE project_id = COALESCE(NEW.project_id, OLD.project_id)
  ),
  updated_at = NOW()
  WHERE id = COALESCE(NEW.project_id, OLD.project_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_update_project_actual_cost
AFTER INSERT OR UPDATE OR DELETE ON project_cost_items
FOR EACH ROW
EXECUTE FUNCTION update_project_actual_cost();

-- Trigger to update updated_at on projects
CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER update_project_notes_updated_at
BEFORE UPDATE ON project_notes
FOR EACH ROW
EXECUTE FUNCTION handle_updated_at();

-- Indexes for performance
CREATE INDEX idx_projects_property ON projects(property_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_archived ON projects(is_archived);
CREATE INDEX idx_project_costs_project ON project_cost_items(project_id);
CREATE INDEX idx_project_documents_project ON project_documents(project_id);
CREATE INDEX idx_project_checklist_items_project ON project_checklist_items(project_id);
CREATE INDEX idx_project_activity_log_project ON project_activity_log(project_id);

-- Insert some default checklist templates
INSERT INTO project_checklist_templates (name, project_type, items) VALUES
('Standard Renovering', 'renovering', '[
  {"title": "Projektering och förstudie", "description": "Genomför initial projektering", "order": 1},
  {"title": "Upphandling av entreprenör", "description": "Välj och kontraktera entreprenör", "order": 2},
  {"title": "Startmöte", "description": "Genomför startmöte med alla parter", "order": 3},
  {"title": "Löpande uppföljning", "description": "Veckovisa eller månatliga uppföljningsmöten", "order": 4},
  {"title": "Slutbesiktning", "description": "Genomför slutbesiktning", "order": 5},
  {"title": "Garantibesiktning", "description": "Garantibesiktning efter 1 år", "order": 6}
]'::jsonb),
('Standard Underhåll', 'underhall', '[
  {"title": "Besiktning och kartläggning", "description": "Kartlägg underhållsbehov", "order": 1},
  {"title": "Prioritering av åtgärder", "description": "Prioritera vilka åtgärder som ska utföras", "order": 2},
  {"title": "Upphandling", "description": "Upphandla leverantörer", "order": 3},
  {"title": "Utförande", "description": "Genomför underhållsåtgärder", "order": 4},
  {"title": "Kvalitetskontroll", "description": "Kontrollera utförande", "order": 5}
]'::jsonb),
('Standard Energi', 'energi', '[
  {"title": "Energikartläggning", "description": "Genomför energikartläggning", "order": 1},
  {"title": "Förslag på åtgärder", "description": "Ta fram åtgärdsförslag", "order": 2},
  {"title": "LCC-analys", "description": "Beräkna livscykelkostnad", "order": 3},
  {"title": "Beslut om genomförande", "description": "Fatta beslut om vilka åtgärder", "order": 4},
  {"title": "Installation", "description": "Genomför installation", "order": 5},
  {"title": "Uppföljning energianvändning", "description": "Följ upp energibesparingar", "order": 6}
]'::jsonb);