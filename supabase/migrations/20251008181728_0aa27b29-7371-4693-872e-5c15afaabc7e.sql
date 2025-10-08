-- Delete all existing components (they use old types)
DELETE FROM public.components;

-- Now change the type column to text temporarily
ALTER TABLE public.components ALTER COLUMN type TYPE text;

-- Drop the old enum
DROP TYPE IF EXISTS public.component_type CASCADE;

-- Create the new enum with SC codes
CREATE TYPE public.component_type AS ENUM (
  'SC1',
  'SC2.1.1',
  'SC2.3',
  'SC2.3.1',
  'SC2.3.3',
  'SC2.3.4',
  'SC2.3.7',
  'SC2.6.2',
  'SC4.1.2.5.1',
  'SC4.1.2.5.3',
  'SC4.1.6.9',
  'SC4.2.4.6',
  'SC4.2.4.7',
  'SC4.5.1',
  'SC4.6.2.6',
  'SC4.6.2.6.1',
  'SC4.7',
  'SC5.5',
  'SC7.1',
  'SC7.2'
);

-- Convert the column to the new enum type
ALTER TABLE public.components 
  ALTER COLUMN type TYPE component_type 
  USING type::component_type;

-- Set default value
ALTER TABLE public.components 
  ALTER COLUMN type SET DEFAULT 'SC1'::component_type;