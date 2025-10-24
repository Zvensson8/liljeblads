-- Fix project_documents to work with organization-owned properties

DROP POLICY IF EXISTS "Users can insert project documents" ON public.project_documents;
DROP POLICY IF EXISTS "Users can view project documents" ON public.project_documents;
DROP POLICY IF EXISTS "Users can update project documents" ON public.project_documents;
DROP POLICY IF EXISTS "Users can delete project documents" ON public.project_documents;

-- Insert policy - works with both owner_id and organization
CREATE POLICY "Users can insert project documents"
ON public.project_documents FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_documents.project_id
    AND (
      p.owner_id = auth.uid() 
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- Select policy
CREATE POLICY "Users can view project documents"
ON public.project_documents FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_documents.project_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  )
);

-- Update policy
CREATE POLICY "Users can update project documents"
ON public.project_documents FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_documents.project_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_documents.project_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

-- Delete policy
CREATE POLICY "Users can delete project documents"
ON public.project_documents FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM projects pr
    JOIN properties p ON pr.property_id = p.id
    WHERE pr.id = project_documents.project_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);