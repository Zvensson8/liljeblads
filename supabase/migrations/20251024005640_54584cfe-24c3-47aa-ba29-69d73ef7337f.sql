-- Fix BOTH component_documents and property_documents for organization support

-- ============ COMPONENT DOCUMENTS ============
DROP POLICY IF EXISTS "Users can insert component documents" ON public.component_documents;
DROP POLICY IF EXISTS "Users can view component documents" ON public.component_documents;
DROP POLICY IF EXISTS "Users can update component documents" ON public.component_documents;
DROP POLICY IF EXISTS "Users can delete component documents" ON public.component_documents;

CREATE POLICY "Users can insert component documents"
ON public.component_documents FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM components c
    LEFT JOIN floors f ON c.floor_id = f.id
    LEFT JOIN properties p1 ON f.property_id = p1.id
    LEFT JOIN properties p2 ON c.property_id = p2.id
    WHERE c.id = component_documents.component_id
    AND (
      p1.owner_id = auth.uid() 
      OR p2.owner_id = auth.uid()
      OR (p1.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p1.organization_id))
      OR (p2.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p2.organization_id))
    )
  )
);

CREATE POLICY "Users can view component documents"
ON public.component_documents FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM components c
    LEFT JOIN floors f ON c.floor_id = f.id
    LEFT JOIN properties p1 ON f.property_id = p1.id
    LEFT JOIN properties p2 ON c.property_id = p2.id
    WHERE c.id = component_documents.component_id
    AND (
      p1.owner_id = auth.uid() 
      OR p2.owner_id = auth.uid()
      OR (p1.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p1.organization_id))
      OR (p2.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p2.organization_id))
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  )
);

CREATE POLICY "Users can update component documents"
ON public.component_documents FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM components c
    LEFT JOIN floors f ON c.floor_id = f.id
    LEFT JOIN properties p1 ON f.property_id = p1.id
    LEFT JOIN properties p2 ON c.property_id = p2.id
    WHERE c.id = component_documents.component_id
    AND (
      p1.owner_id = auth.uid() 
      OR p2.owner_id = auth.uid()
      OR (p1.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p1.organization_id))
      OR (p2.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p2.organization_id))
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM components c
    LEFT JOIN floors f ON c.floor_id = f.id
    LEFT JOIN properties p1 ON f.property_id = p1.id
    LEFT JOIN properties p2 ON c.property_id = p2.id
    WHERE c.id = component_documents.component_id
    AND (
      p1.owner_id = auth.uid() 
      OR p2.owner_id = auth.uid()
      OR (p1.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p1.organization_id))
      OR (p2.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p2.organization_id))
    )
  )
);

CREATE POLICY "Users can delete component documents"
ON public.component_documents FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM components c
    LEFT JOIN floors f ON c.floor_id = f.id
    LEFT JOIN properties p1 ON f.property_id = p1.id
    LEFT JOIN properties p2 ON c.property_id = p2.id
    WHERE c.id = component_documents.component_id
    AND (
      p1.owner_id = auth.uid() 
      OR p2.owner_id = auth.uid()
      OR (p1.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p1.organization_id))
      OR (p2.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p2.organization_id))
    )
  )
);

-- ============ PROPERTY DOCUMENTS ============
DROP POLICY IF EXISTS "Users can insert property documents" ON public.property_documents;
DROP POLICY IF EXISTS "Users can view property documents" ON public.property_documents;
DROP POLICY IF EXISTS "Users can update property documents" ON public.property_documents;
DROP POLICY IF EXISTS "Users can delete property documents" ON public.property_documents;
DROP POLICY IF EXISTS "Users can create documents for accessible properties" ON public.property_documents;
DROP POLICY IF EXISTS "Users can view documents for accessible properties" ON public.property_documents;
DROP POLICY IF EXISTS "Users can delete documents for accessible properties" ON public.property_documents;

CREATE POLICY "Users can insert property documents"
ON public.property_documents FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM properties p
    WHERE p.id = property_documents.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Users can view property documents"
ON public.property_documents FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM properties p
    WHERE p.id = property_documents.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  )
);

CREATE POLICY "Users can update property documents"
ON public.property_documents FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM properties p
    WHERE p.id = property_documents.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM properties p
    WHERE p.id = property_documents.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);

CREATE POLICY "Users can delete property documents"
ON public.property_documents FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM properties p
    WHERE p.id = property_documents.property_id
    AND (
      p.owner_id = auth.uid()
      OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
    )
  )
);