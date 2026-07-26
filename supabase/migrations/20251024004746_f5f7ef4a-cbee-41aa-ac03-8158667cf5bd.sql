-- Fix component_documents RLS policies to handle both floor-based and direct property components

-- Drop the conflicting old policy
DROP POLICY IF EXISTS "Users can create documents for accessible components" ON public.component_documents;

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Users can insert their own component documents" ON public.component_documents;

-- Create a comprehensive INSERT policy that handles both cases
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
    AND (p1.owner_id = auth.uid() OR p2.owner_id = auth.uid())
  )
);

-- Update other policies similarly
DROP POLICY IF EXISTS "Users can delete documents for accessible components" ON public.component_documents;
DROP POLICY IF EXISTS "Users can delete their own component documents" ON public.component_documents;

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
    AND (p1.owner_id = auth.uid() OR p2.owner_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can view documents for accessible components" ON public.component_documents;
DROP POLICY IF EXISTS "Users can view component documents" ON public.component_documents;

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
    AND (p1.owner_id = auth.uid() OR p2.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

DROP POLICY IF EXISTS "Users can update their own component documents" ON public.component_documents;

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
    AND (p1.owner_id = auth.uid() OR p2.owner_id = auth.uid())
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
    AND (p1.owner_id = auth.uid() OR p2.owner_id = auth.uid())
  )
);