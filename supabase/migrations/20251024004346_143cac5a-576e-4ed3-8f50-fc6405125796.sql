-- Fix RLS policies for document tables to allow INSERT operations

-- Component documents policies
DROP POLICY IF EXISTS "Users can insert their own component documents" ON public.component_documents;
CREATE POLICY "Users can insert their own component documents"
ON public.component_documents FOR INSERT TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view component documents" ON public.component_documents;
CREATE POLICY "Users can view component documents"
ON public.component_documents FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can update their own component documents" ON public.component_documents;
CREATE POLICY "Users can update their own component documents"
ON public.component_documents FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete their own component documents" ON public.component_documents;
CREATE POLICY "Users can delete their own component documents"
ON public.component_documents FOR DELETE TO authenticated
USING (true);

-- Property documents policies
DROP POLICY IF EXISTS "Users can insert property documents" ON public.property_documents;
CREATE POLICY "Users can insert property documents"
ON public.property_documents FOR INSERT TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view property documents" ON public.property_documents;
CREATE POLICY "Users can view property documents"
ON public.property_documents FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can update property documents" ON public.property_documents;
CREATE POLICY "Users can update property documents"
ON public.property_documents FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete property documents" ON public.property_documents;
CREATE POLICY "Users can delete property documents"
ON public.property_documents FOR DELETE TO authenticated
USING (true);

-- Project documents policies
DROP POLICY IF EXISTS "Users can insert project documents" ON public.project_documents;
CREATE POLICY "Users can insert project documents"
ON public.project_documents FOR INSERT TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view project documents" ON public.project_documents;
CREATE POLICY "Users can view project documents"
ON public.project_documents FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can update project documents" ON public.project_documents;
CREATE POLICY "Users can update project documents"
ON public.project_documents FOR UPDATE TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can delete project documents" ON public.project_documents;
CREATE POLICY "Users can delete project documents"
ON public.project_documents FOR DELETE TO authenticated
USING (true);