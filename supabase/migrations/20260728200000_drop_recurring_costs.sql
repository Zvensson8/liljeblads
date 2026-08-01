-- Remove recurring costs module entirely (app feature removed).
-- Order: history → property costs → account codes; clean module access rows.

DROP TABLE IF EXISTS public.recurring_cost_history CASCADE;
DROP TABLE IF EXISTS public.property_recurring_costs CASCADE;
DROP TABLE IF EXISTS public.account_codes CASCADE;

-- Orphan module flag from user_module_access (if table exists)
DELETE FROM public.user_module_access
WHERE module_name = 'recurring-costs';
