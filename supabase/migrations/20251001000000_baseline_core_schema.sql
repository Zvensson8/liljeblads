-- Baseline core schema for fresh Supabase projects.
-- Lovable Cloud kept the original schema outside of migrations; this recreates
-- the tables/enums that later migrations assume already exist.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums (initial versions; later migrations refine some of them)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('admin', 'user', 'reader');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.component_status AS ENUM (
    'active',
    'inactive',
    'maintenance',
    'needs_repair',
    'decommissioned'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
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
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role public.user_role NOT NULL DEFAULT 'user',
  approved boolean NOT NULL DEFAULT false,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  description text,
  property_type text,
  property_number text,
  construction_year integer,
  area_sqm numeric,
  loa text,
  invoice_address text,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  level integer,
  drawing_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  floor_id uuid REFERENCES public.floors(id) ON DELETE SET NULL,
  name text NOT NULL,
  type public.component_type NOT NULL DEFAULT 'SC1',
  status public.component_status NOT NULL DEFAULT 'active',
  manufacturer text,
  model text,
  serial_number text,
  registration_number text,
  installation_year integer,
  room_zone text,
  notes text,
  priority integer,
  next_service_date date,
  supplier text,
  aff_code text,
  cost_center text,
  refrigerant_type text,
  refrigerant_code text,
  refrigerant_amount_kg numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.component_geometry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id uuid NOT NULL REFERENCES public.components(id) ON DELETE CASCADE,
  x double precision NOT NULL DEFAULT 0,
  y double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_properties_owner_id ON public.properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_floors_property_id ON public.floors(property_id);
CREATE INDEX IF NOT EXISTS idx_components_property_id ON public.components(property_id);
CREATE INDEX IF NOT EXISTS idx_components_floor_id ON public.components(floor_id);
CREATE INDEX IF NOT EXISTS idx_component_geometry_component_id ON public.component_geometry(component_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.component_geometry ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Helper used by the first historical migration
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = _user_id LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- Auto-create profile on signup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NULL),
    'user',
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Storage: floor drawings bucket (made private in a later migration)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('floor-drawings', 'floor-drawings', true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Grants (Supabase PostgREST)
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
