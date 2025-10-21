-- Add new fields to properties table
ALTER TABLE properties
ADD COLUMN IF NOT EXISTS construction_year integer,
ADD COLUMN IF NOT EXISTS property_type text,
ADD COLUMN IF NOT EXISTS loa text,
ADD COLUMN IF NOT EXISTS property_number text,
ADD COLUMN IF NOT EXISTS invoice_address text;

-- Create property_notes table
CREATE TABLE IF NOT EXISTS property_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create property_todos table
CREATE TABLE IF NOT EXISTS property_todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  title text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  due_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create property_contacts table
CREATE TABLE IF NOT EXISTS property_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  phone text,
  email text,
  company text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create property_documents table
CREATE TABLE IF NOT EXISTS property_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_url text NOT NULL,
  file_size bigint,
  mime_type text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create work_order_files table for file uploads
CREATE TABLE IF NOT EXISTS work_order_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_url text NOT NULL,
  file_size bigint,
  mime_type text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE property_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_order_files ENABLE ROW LEVEL SECURITY;

-- RLS Policies for property_notes
CREATE POLICY "Users can view notes for accessible properties"
  ON property_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_notes.property_id 
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Users can create notes for accessible properties"
  ON property_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_notes.property_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update notes for accessible properties"
  ON property_notes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_notes.property_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete notes for accessible properties"
  ON property_notes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_notes.property_id AND p.owner_id = auth.uid()
    )
  );

-- RLS Policies for property_todos
CREATE POLICY "Users can view todos for accessible properties"
  ON property_todos FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_todos.property_id 
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Users can create todos for accessible properties"
  ON property_todos FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_todos.property_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update todos for accessible properties"
  ON property_todos FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_todos.property_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete todos for accessible properties"
  ON property_todos FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_todos.property_id AND p.owner_id = auth.uid()
    )
  );

-- RLS Policies for property_contacts
CREATE POLICY "Users can view contacts for accessible properties"
  ON property_contacts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_contacts.property_id 
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Users can create contacts for accessible properties"
  ON property_contacts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_contacts.property_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update contacts for accessible properties"
  ON property_contacts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_contacts.property_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete contacts for accessible properties"
  ON property_contacts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_contacts.property_id AND p.owner_id = auth.uid()
    )
  );

-- RLS Policies for property_documents
CREATE POLICY "Users can view documents for accessible properties"
  ON property_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_documents.property_id 
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Users can create documents for accessible properties"
  ON property_documents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_documents.property_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete documents for accessible properties"
  ON property_documents FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_documents.property_id AND p.owner_id = auth.uid()
    )
  );

-- RLS Policies for work_order_files
CREATE POLICY "Users can view files for accessible work orders"
  ON work_order_files FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM work_orders wo
      JOIN properties p ON wo.property_id = p.id
      WHERE wo.id = work_order_files.work_order_id 
      AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Users can create files for accessible work orders"
  ON work_order_files FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_orders wo
      JOIN properties p ON wo.property_id = p.id
      WHERE wo.id = work_order_files.work_order_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete files for accessible work orders"
  ON work_order_files FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM work_orders wo
      JOIN properties p ON wo.property_id = p.id
      WHERE wo.id = work_order_files.work_order_id AND p.owner_id = auth.uid()
    )
  );

-- Create storage bucket for property documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('property-documents', 'property-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for property documents
CREATE POLICY "Users can view their property documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'property-documents' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can upload their property documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'property-documents' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their property documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'property-documents' 
    AND auth.uid()::text = (storage.foldername(name))[1]
  );