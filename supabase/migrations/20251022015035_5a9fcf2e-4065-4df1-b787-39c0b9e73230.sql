-- Fas 1: Organisations-struktur

-- Skapa organisations-tabell
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  max_properties INTEGER NOT NULL DEFAULT 10,
  max_users INTEGER NOT NULL DEFAULT 5,
  subscription_tier TEXT NOT NULL DEFAULT 'small',
  logo_url TEXT,
  primary_color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Skapa organisation medlems-tabell
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- Skapa organisations-inbjudningar
CREATE TABLE public.organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  UNIQUE(organization_id, email)
);

-- Lägg till organization_id till properties
ALTER TABLE public.properties ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Lägg till organization_id till profiles
ALTER TABLE public.profiles ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Skapa index för prestanda
CREATE INDEX idx_organization_members_user ON public.organization_members(user_id);
CREATE INDEX idx_organization_members_org ON public.organization_members(organization_id);
CREATE INDEX idx_properties_organization ON public.properties(organization_id);
CREATE INDEX idx_profiles_organization ON public.profiles(organization_id);
CREATE INDEX idx_organization_invitations_email ON public.organization_invitations(email);
CREATE INDEX idx_organization_invitations_org ON public.organization_invitations(organization_id);

-- Security definer function för att kolla organisation-medlemskap
CREATE OR REPLACE FUNCTION public.is_organization_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id AND organization_id = _org_id
  )
$$;

-- Security definer function för att kolla organisation-roll
CREATE OR REPLACE FUNCTION public.has_organization_role(_user_id UUID, _org_id UUID, _role TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id 
    AND organization_id = _org_id 
    AND role = _role
  )
$$;

-- Security definer function för att hämta användarens organisation
CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Trigger för updated_at
CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Migrera befintlig data: Skapa organisations för varje användare som har fastigheter
DO $$
DECLARE
  user_record RECORD;
  new_org_id UUID;
BEGIN
  FOR user_record IN 
    SELECT DISTINCT owner_id, 
           (SELECT email FROM auth.users WHERE id = owner_id) as email,
           (SELECT full_name FROM public.profiles WHERE id = owner_id) as full_name
    FROM public.properties 
    WHERE owner_id IS NOT NULL
  LOOP
    -- Skapa organisation för användaren
    INSERT INTO public.organizations (name, max_properties, max_users, subscription_tier)
    VALUES (
      COALESCE(user_record.full_name, user_record.email, 'Min Organisation'),
      300,
      60,
      'enterprise'
    )
    RETURNING id INTO new_org_id;
    
    -- Lägg till användaren som owner
    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (new_org_id, user_record.owner_id, 'owner');
    
    -- Uppdatera alla fastigheter
    UPDATE public.properties
    SET organization_id = new_org_id
    WHERE owner_id = user_record.owner_id;
    
    -- Uppdatera profil
    UPDATE public.profiles
    SET organization_id = new_org_id
    WHERE id = user_record.owner_id;
  END LOOP;
END $$;

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

-- RLS Policies för organizations
CREATE POLICY "Users can view their organization"
ON public.organizations FOR SELECT
USING (public.is_organization_member(auth.uid(), id));

CREATE POLICY "Organization owners can update their organization"
ON public.organizations FOR UPDATE
USING (public.has_organization_role(auth.uid(), id, 'owner') OR public.has_organization_role(auth.uid(), id, 'admin'));

CREATE POLICY "Users can create organizations"
ON public.organizations FOR INSERT
WITH CHECK (true);

-- RLS Policies för organization_members
CREATE POLICY "Users can view members of their organization"
ON public.organization_members FOR SELECT
USING (public.is_organization_member(auth.uid(), organization_id) OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Organization owners can manage members"
ON public.organization_members FOR ALL
USING (public.has_organization_role(auth.uid(), organization_id, 'owner') OR public.has_organization_role(auth.uid(), organization_id, 'admin'));

-- RLS Policies för organization_invitations
CREATE POLICY "Users can view invitations for their organization"
ON public.organization_invitations FOR SELECT
USING (
  public.is_organization_member(auth.uid(), organization_id) 
  OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

CREATE POLICY "Organization admins can create invitations"
ON public.organization_invitations FOR INSERT
WITH CHECK (
  public.has_organization_role(auth.uid(), organization_id, 'owner') 
  OR public.has_organization_role(auth.uid(), organization_id, 'admin')
);

CREATE POLICY "Organization admins can delete invitations"
ON public.organization_invitations FOR DELETE
USING (
  public.has_organization_role(auth.uid(), organization_id, 'owner') 
  OR public.has_organization_role(auth.uid(), organization_id, 'admin')
);

-- Uppdatera properties RLS policies
DROP POLICY IF EXISTS "Users can view their own or assigned properties" ON public.properties;
CREATE POLICY "Users can view their organization properties"
ON public.properties FOR SELECT
USING (
  (organization_id IS NOT NULL AND public.is_organization_member(auth.uid(), organization_id))
  OR has_role(auth.uid(), 'admin')
  OR (EXISTS (
    SELECT 1 FROM property_users
    WHERE property_users.property_id = properties.id 
    AND property_users.user_id = auth.uid()
  ))
);

DROP POLICY IF EXISTS "Users can create properties" ON public.properties;
CREATE POLICY "Users can create properties in their organization"
ON public.properties FOR INSERT
WITH CHECK (
  organization_id = public.get_user_organization_id(auth.uid())
  AND (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND approved = true))
);

DROP POLICY IF EXISTS "Users can update their own properties" ON public.properties;
CREATE POLICY "Users can update their organization properties"
ON public.properties FOR UPDATE
USING (
  organization_id IS NOT NULL 
  AND public.is_organization_member(auth.uid(), organization_id)
  AND (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND approved = true))
);

DROP POLICY IF EXISTS "Users can delete their own properties" ON public.properties;
CREATE POLICY "Users can delete their organization properties"
ON public.properties FOR DELETE
USING (
  organization_id IS NOT NULL 
  AND (
    public.has_organization_role(auth.uid(), organization_id, 'owner')
    OR public.has_organization_role(auth.uid(), organization_id, 'admin')
  )
  AND (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND approved = true))
);

-- Funktion för att validera prenumerationsgränser
CREATE OR REPLACE FUNCTION public.check_organization_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_record RECORD;
  current_count INTEGER;
BEGIN
  -- Hämta organisations-info
  SELECT max_properties, max_users INTO org_record
  FROM public.organizations
  WHERE id = NEW.organization_id;
  
  -- Kolla gräns för nya fastigheter
  IF TG_TABLE_NAME = 'properties' AND TG_OP = 'INSERT' THEN
    SELECT COUNT(*) INTO current_count
    FROM public.properties
    WHERE organization_id = NEW.organization_id;
    
    IF current_count >= org_record.max_properties THEN
      RAISE EXCEPTION 'Organization has reached maximum number of properties (%). Please upgrade subscription.', org_record.max_properties;
    END IF;
  END IF;
  
  -- Kolla gräns för nya medlemmar
  IF TG_TABLE_NAME = 'organization_members' AND TG_OP = 'INSERT' THEN
    SELECT COUNT(*) INTO current_count
    FROM public.organization_members
    WHERE organization_id = NEW.organization_id;
    
    IF current_count >= org_record.max_users THEN
      RAISE EXCEPTION 'Organization has reached maximum number of users (%). Please upgrade subscription.', org_record.max_users;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Triggers för att enforca gränser
CREATE TRIGGER enforce_property_limit
BEFORE INSERT ON public.properties
FOR EACH ROW
WHEN (NEW.organization_id IS NOT NULL)
EXECUTE FUNCTION public.check_organization_limits();

CREATE TRIGGER enforce_member_limit
BEFORE INSERT ON public.organization_members
FOR EACH ROW
EXECUTE FUNCTION public.check_organization_limits();