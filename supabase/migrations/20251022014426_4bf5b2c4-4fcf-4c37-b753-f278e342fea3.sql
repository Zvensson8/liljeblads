-- Drop component_costs table and related policies
DROP POLICY IF EXISTS "Users can view costs for accessible components" ON public.component_costs;
DROP POLICY IF EXISTS "Users can create costs for accessible components" ON public.component_costs;
DROP POLICY IF EXISTS "Users can update costs for accessible components" ON public.component_costs;
DROP POLICY IF EXISTS "Users can delete costs for accessible components" ON public.component_costs;
DROP TRIGGER IF EXISTS update_component_costs_updated_at ON public.component_costs;
DROP TABLE IF EXISTS public.component_costs;