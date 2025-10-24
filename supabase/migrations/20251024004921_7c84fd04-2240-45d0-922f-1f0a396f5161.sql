-- Fix project_documents RLS policies by removing conflicting policies

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Users can insert project documents" ON public.project_documents;
DROP POLICY IF EXISTS "Users can update project documents" ON public.project_documents;
DROP POLICY IF EXISTS "Users can delete project documents" ON public.project_documents;
DROP POLICY IF EXISTS "Users can view project documents" ON public.project_documents;

-- Keep and ensure the proper policy exists
DROP POLICY IF EXISTS "Users can manage documents for accessible projects" ON public.project_documents;

-- Create comprehensive policies that check project ownership via property
CREATE POLICY "Users can insert project documents"
ON public.project_documents FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_documents.project_id
    AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can view project documents"
ON public.project_documents FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_documents.project_id
    AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "Users can update project documents"
ON public.project_documents FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_documents.project_id
    AND p.owner_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_documents.project_id
    AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can delete project documents"
ON public.project_documents FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_documents.project_id
    AND p.owner_id = auth.uid()
  )
);