-- Add refrigerant-specific columns for cooling systems (SC4.5.1)
-- IF NOT EXISTS: columns may already exist from baseline on fresh installs
ALTER TABLE public.components ADD COLUMN IF NOT EXISTS refrigerant_code TEXT;
ALTER TABLE public.components ADD COLUMN IF NOT EXISTS refrigerant_amount_kg NUMERIC(10, 2);
ALTER TABLE public.components ADD COLUMN IF NOT EXISTS refrigerant_type TEXT;