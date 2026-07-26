-- Liljeblads bootstrap: first founder/admin
-- 1) Registrera dig i appen (http://localhost:8080)
-- 2) Ersätt e-postadressen nedan
-- 3) Kör i SQL Editor:
--    https://supabase.com/dashboard/project/ojiswgqntenvbwtopxbu/sql/new

UPDATE public.profiles
SET approved = true,
    role = 'admin'
WHERE email = 'YOUR_EMAIL@example.com';

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'founder'::app_role
FROM public.profiles
WHERE email = 'YOUR_EMAIL@example.com'
ON CONFLICT DO NOTHING;

INSERT INTO public.organizations (name, subscription_tier, max_properties, max_users)
SELECT 'Liljeblads', 'enterprise', 999, 50
WHERE NOT EXISTS (SELECT 1 FROM public.organizations LIMIT 1);

UPDATE public.profiles p
SET organization_id = (SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1)
WHERE email = 'YOUR_EMAIL@example.com'
  AND organization_id IS NULL;

INSERT INTO public.organization_members (organization_id, user_id, role)
SELECT p.organization_id, p.id, 'owner'
FROM public.profiles p
WHERE p.email = 'YOUR_EMAIL@example.com'
  AND p.organization_id IS NOT NULL
ON CONFLICT DO NOTHING;