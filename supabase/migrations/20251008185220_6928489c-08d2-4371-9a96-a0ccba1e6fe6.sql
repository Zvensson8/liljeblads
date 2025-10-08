-- Add refrigerant-specific columns for cooling systems (SC4.5.1)
ALTER TABLE public.components
ADD COLUMN refrigerant_code TEXT,
ADD COLUMN refrigerant_amount_kg NUMERIC(10, 2),
ADD COLUMN refrigerant_type TEXT;