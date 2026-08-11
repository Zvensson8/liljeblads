-- Fas cleanup: remove floors (incl. drawings) and drift_tasks stack.
-- Components keep property_id + room_zone for placement text only.
-- RLS that referenced floors/floor_id is recreated on property_id only.

-- ---------------------------------------------------------------------------
-- 0) Drop RLS that depends on components.floor_id / public.floors
-- ---------------------------------------------------------------------------

-- components
DROP POLICY IF EXISTS "Authenticated users can view components" ON public.components;
DROP POLICY IF EXISTS "Authenticated users can create components" ON public.components;
DROP POLICY IF EXISTS "Authenticated users can update components" ON public.components;
DROP POLICY IF EXISTS "Authenticated users can delete components" ON public.components;

-- component_documents
DROP POLICY IF EXISTS "Users can view component documents" ON public.component_documents;
DROP POLICY IF EXISTS "Users can insert component documents" ON public.component_documents;
DROP POLICY IF EXISTS "Users can update component documents" ON public.component_documents;
DROP POLICY IF EXISTS "Users can delete component documents" ON public.component_documents;

-- component_service_plans
DROP POLICY IF EXISTS "Authenticated users can view service plans" ON public.component_service_plans;
DROP POLICY IF EXISTS "Authenticated users can create service plans" ON public.component_service_plans;
DROP POLICY IF EXISTS "Authenticated users can update service plans" ON public.component_service_plans;
DROP POLICY IF EXISTS "Authenticated users can delete service plans" ON public.component_service_plans;

-- component_purchase_info
DROP POLICY IF EXISTS "Financial users can view purchase info" ON public.component_purchase_info;
DROP POLICY IF EXISTS "Financial users can create purchase info" ON public.component_purchase_info;
DROP POLICY IF EXISTS "Financial users can update purchase info" ON public.component_purchase_info;
DROP POLICY IF EXISTS "Financial users can delete purchase info" ON public.component_purchase_info;

-- cost_budgets
DROP POLICY IF EXISTS "Users can view budgets for accessible properties/components" ON public.cost_budgets;
DROP POLICY IF EXISTS "Users can create budgets for accessible properties/components" ON public.cost_budgets;
DROP POLICY IF EXISTS "Users can update budgets for accessible properties/components" ON public.cost_budgets;
DROP POLICY IF EXISTS "Users can delete budgets for accessible properties/components" ON public.cost_budgets;

-- floors (table itself)
DROP POLICY IF EXISTS "Authenticated users can view floors" ON public.floors;
DROP POLICY IF EXISTS "Authenticated users can create floors" ON public.floors;
DROP POLICY IF EXISTS "Authenticated users can update floors" ON public.floors;
DROP POLICY IF EXISTS "Authenticated users can delete floors" ON public.floors;

-- storage (floor drawings + component docs that joined via floor)
DROP POLICY IF EXISTS "Users can view their floor drawings" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their floor drawings" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their floor drawings" ON storage.objects;
DROP POLICY IF EXISTS "Org members can view component documents storage" ON storage.objects;

-- ---------------------------------------------------------------------------
-- 1) Drift / operations stack
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.drift_task_components CASCADE;
DROP TABLE IF EXISTS public.drift_task_templates CASCADE;
DROP TABLE IF EXISTS public.drift_tasks CASCADE;
DROP TABLE IF EXISTS public.drift_categories CASCADE;

DROP TABLE IF EXISTS public.scheduled_reports CASCADE;

-- ---------------------------------------------------------------------------
-- 2) maintenance_history no longer links to drift tasks
-- ---------------------------------------------------------------------------
ALTER TABLE public.maintenance_history
  DROP COLUMN IF EXISTS drift_task_id;

-- ---------------------------------------------------------------------------
-- 3) Detach components from floors, then drop floors
-- ---------------------------------------------------------------------------
ALTER TABLE public.components
  DROP CONSTRAINT IF EXISTS components_floor_id_fkey;

DROP INDEX IF EXISTS public.idx_components_floor_id;

ALTER TABLE public.components
  DROP COLUMN IF EXISTS floor_id;

DROP TABLE IF EXISTS public.floors CASCADE;

-- ---------------------------------------------------------------------------
-- 4) Storage: floor-drawings bucket
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'floor-drawings') THEN
    DELETE FROM storage.objects WHERE bucket_id = 'floor-drawings';
    DELETE FROM storage.buckets WHERE id = 'floor-drawings';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'floor-drawings storage cleanup skipped: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 5) Recreate simplified RLS (property_id only)
-- ---------------------------------------------------------------------------

-- Helper: can access property as owner, assignee, org member, or platform admin
-- (inlined in policies to match multi-org isolation)

-- components
CREATE POLICY "Authenticated users can view components"
ON public.components
FOR SELECT
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR (
    property_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = components.property_id
        AND (
          p.owner_id = auth.uid()
          OR public.user_has_property_assignment(auth.uid(), p.id)
          OR (
            p.organization_id IS NOT NULL
            AND public.is_organization_member(auth.uid(), p.organization_id)
          )
        )
    )
  )
);

CREATE POLICY "Authenticated users can create components"
ON public.components
FOR INSERT
TO public
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR (
    property_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = components.property_id
        AND (
          p.owner_id = auth.uid()
          OR (
            p.organization_id IS NOT NULL
            AND public.is_organization_member(auth.uid(), p.organization_id)
          )
        )
    )
  )
);

CREATE POLICY "Authenticated users can update components"
ON public.components
FOR UPDATE
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR (
    property_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = components.property_id
        AND (
          p.owner_id = auth.uid()
          OR (
            p.organization_id IS NOT NULL
            AND public.is_organization_member(auth.uid(), p.organization_id)
          )
        )
    )
  )
)
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR (
    property_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = components.property_id
        AND (
          p.owner_id = auth.uid()
          OR (
            p.organization_id IS NOT NULL
            AND public.is_organization_member(auth.uid(), p.organization_id)
          )
        )
    )
  )
);

CREATE POLICY "Authenticated users can delete components"
ON public.components
FOR DELETE
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR (
    property_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = components.property_id
        AND (
          p.owner_id = auth.uid()
          OR (
            p.organization_id IS NOT NULL
            AND public.is_organization_member(auth.uid(), p.organization_id)
          )
        )
    )
  )
);

-- component_documents (via component → property)
CREATE POLICY "Users can view component documents"
ON public.component_documents
FOR SELECT
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.components c
    JOIN public.properties p ON p.id = c.property_id
    WHERE c.id = component_documents.component_id
      AND (
        p.owner_id = auth.uid()
        OR public.user_has_property_assignment(auth.uid(), p.id)
        OR (
          p.organization_id IS NOT NULL
          AND public.is_organization_member(auth.uid(), p.organization_id)
        )
      )
  )
);

CREATE POLICY "Users can insert component documents"
ON public.component_documents
FOR INSERT
TO public
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.components c
    JOIN public.properties p ON p.id = c.property_id
    WHERE c.id = component_documents.component_id
      AND (
        p.owner_id = auth.uid()
        OR (
          p.organization_id IS NOT NULL
          AND public.is_organization_member(auth.uid(), p.organization_id)
        )
      )
  )
);

CREATE POLICY "Users can update component documents"
ON public.component_documents
FOR UPDATE
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.components c
    JOIN public.properties p ON p.id = c.property_id
    WHERE c.id = component_documents.component_id
      AND (
        p.owner_id = auth.uid()
        OR (
          p.organization_id IS NOT NULL
          AND public.is_organization_member(auth.uid(), p.organization_id)
        )
      )
  )
);

CREATE POLICY "Users can delete component documents"
ON public.component_documents
FOR DELETE
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.components c
    JOIN public.properties p ON p.id = c.property_id
    WHERE c.id = component_documents.component_id
      AND (
        p.owner_id = auth.uid()
        OR (
          p.organization_id IS NOT NULL
          AND public.is_organization_member(auth.uid(), p.organization_id)
        )
      )
  )
);

-- component_service_plans
CREATE POLICY "Authenticated users can view service plans"
ON public.component_service_plans
FOR SELECT
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.components c
    JOIN public.properties p ON p.id = c.property_id
    WHERE c.id = component_service_plans.component_id
      AND (
        p.owner_id = auth.uid()
        OR public.user_has_property_assignment(auth.uid(), p.id)
        OR (
          p.organization_id IS NOT NULL
          AND public.is_organization_member(auth.uid(), p.organization_id)
        )
      )
  )
);

CREATE POLICY "Authenticated users can create service plans"
ON public.component_service_plans
FOR INSERT
TO public
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.components c
    JOIN public.properties p ON p.id = c.property_id
    WHERE c.id = component_service_plans.component_id
      AND (
        p.owner_id = auth.uid()
        OR (
          p.organization_id IS NOT NULL
          AND public.is_organization_member(auth.uid(), p.organization_id)
        )
      )
  )
);

CREATE POLICY "Authenticated users can update service plans"
ON public.component_service_plans
FOR UPDATE
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.components c
    JOIN public.properties p ON p.id = c.property_id
    WHERE c.id = component_service_plans.component_id
      AND (
        p.owner_id = auth.uid()
        OR (
          p.organization_id IS NOT NULL
          AND public.is_organization_member(auth.uid(), p.organization_id)
        )
      )
  )
);

CREATE POLICY "Authenticated users can delete service plans"
ON public.component_service_plans
FOR DELETE
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.components c
    JOIN public.properties p ON p.id = c.property_id
    WHERE c.id = component_service_plans.component_id
      AND (
        p.owner_id = auth.uid()
        OR (
          p.organization_id IS NOT NULL
          AND public.is_organization_member(auth.uid(), p.organization_id)
        )
      )
  )
);

-- component_purchase_info
CREATE POLICY "Financial users can view purchase info"
ON public.component_purchase_info
FOR SELECT
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.components c
    JOIN public.properties p ON p.id = c.property_id
    WHERE c.id = component_purchase_info.component_id
      AND (
        p.owner_id = auth.uid()
        OR public.user_has_property_assignment(auth.uid(), p.id)
        OR (
          p.organization_id IS NOT NULL
          AND public.is_organization_member(auth.uid(), p.organization_id)
        )
      )
  )
);

CREATE POLICY "Financial users can create purchase info"
ON public.component_purchase_info
FOR INSERT
TO public
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.components c
    JOIN public.properties p ON p.id = c.property_id
    WHERE c.id = component_purchase_info.component_id
      AND (
        p.owner_id = auth.uid()
        OR (
          p.organization_id IS NOT NULL
          AND public.is_organization_member(auth.uid(), p.organization_id)
        )
      )
  )
);

CREATE POLICY "Financial users can update purchase info"
ON public.component_purchase_info
FOR UPDATE
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.components c
    JOIN public.properties p ON p.id = c.property_id
    WHERE c.id = component_purchase_info.component_id
      AND (
        p.owner_id = auth.uid()
        OR (
          p.organization_id IS NOT NULL
          AND public.is_organization_member(auth.uid(), p.organization_id)
        )
      )
  )
);

CREATE POLICY "Financial users can delete purchase info"
ON public.component_purchase_info
FOR DELETE
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.components c
    JOIN public.properties p ON p.id = c.property_id
    WHERE c.id = component_purchase_info.component_id
      AND (
        p.owner_id = auth.uid()
        OR (
          p.organization_id IS NOT NULL
          AND public.is_organization_member(auth.uid(), p.organization_id)
        )
      )
  )
);

-- cost_budgets: property_id OR component → property
CREATE POLICY "Users can view budgets for accessible properties/components"
ON public.cost_budgets
FOR SELECT
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR (
    property_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = cost_budgets.property_id
        AND (
          p.owner_id = auth.uid()
          OR public.user_has_property_assignment(auth.uid(), p.id)
          OR (
            p.organization_id IS NOT NULL
            AND public.is_organization_member(auth.uid(), p.organization_id)
          )
        )
    )
  )
  OR (
    component_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.components c
      JOIN public.properties p ON p.id = c.property_id
      WHERE c.id = cost_budgets.component_id
        AND (
          p.owner_id = auth.uid()
          OR public.user_has_property_assignment(auth.uid(), p.id)
          OR (
            p.organization_id IS NOT NULL
            AND public.is_organization_member(auth.uid(), p.organization_id)
          )
        )
    )
  )
);

CREATE POLICY "Users can create budgets for accessible properties/components"
ON public.cost_budgets
FOR INSERT
TO public
WITH CHECK (
  public.is_platform_admin(auth.uid())
  OR (
    property_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = cost_budgets.property_id
        AND (
          p.owner_id = auth.uid()
          OR (
            p.organization_id IS NOT NULL
            AND public.is_organization_member(auth.uid(), p.organization_id)
          )
        )
    )
  )
  OR (
    component_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.components c
      JOIN public.properties p ON p.id = c.property_id
      WHERE c.id = cost_budgets.component_id
        AND (
          p.owner_id = auth.uid()
          OR (
            p.organization_id IS NOT NULL
            AND public.is_organization_member(auth.uid(), p.organization_id)
          )
        )
    )
  )
);

CREATE POLICY "Users can update budgets for accessible properties/components"
ON public.cost_budgets
FOR UPDATE
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR (
    property_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = cost_budgets.property_id
        AND (
          p.owner_id = auth.uid()
          OR (
            p.organization_id IS NOT NULL
            AND public.is_organization_member(auth.uid(), p.organization_id)
          )
        )
    )
  )
  OR (
    component_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.components c
      JOIN public.properties p ON p.id = c.property_id
      WHERE c.id = cost_budgets.component_id
        AND (
          p.owner_id = auth.uid()
          OR (
            p.organization_id IS NOT NULL
            AND public.is_organization_member(auth.uid(), p.organization_id)
          )
        )
    )
  )
);

CREATE POLICY "Users can delete budgets for accessible properties/components"
ON public.cost_budgets
FOR DELETE
TO public
USING (
  public.is_platform_admin(auth.uid())
  OR (
    property_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = cost_budgets.property_id
        AND (
          p.owner_id = auth.uid()
          OR (
            p.organization_id IS NOT NULL
            AND public.is_organization_member(auth.uid(), p.organization_id)
          )
        )
    )
  )
  OR (
    component_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.components c
      JOIN public.properties p ON p.id = c.property_id
      WHERE c.id = cost_budgets.component_id
        AND (
          p.owner_id = auth.uid()
          OR (
            p.organization_id IS NOT NULL
            AND public.is_organization_member(auth.uid(), p.organization_id)
          )
        )
    )
  )
);

-- component-documents storage: path-based org access (best-effort; bucket may vary)
CREATE POLICY "Org members can view component documents storage"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'component-documents'
  AND (
    public.is_platform_admin(auth.uid())
    OR auth.uid()::text = (storage.foldername(name))[1]
  )
);
