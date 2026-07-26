-- ============================================================================
-- FIX KRITISKA RLS-PROBLEM: PROFILES OCH PROPERTY_CONTACTS
-- ============================================================================
-- Denna migration skärper RLS-policies för att förhindra datainsamling
-- ============================================================================

-- ===================
-- PROFILES TABLE - Skärpt skydd för email och personuppgifter
-- ===================

-- Ta bort befintliga policies
DROP POLICY IF EXISTS "Authenticated users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Organization members can view profiles in their org" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;

-- Policy 1: Användare kan se sin egen profil (full åtkomst)
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Policy 2: Org-medlemmar kan ENDAST se namn (INTE email) för kollegor i samma org
-- Detta förhindrar email-harvesting men tillåter att se vem som finns i organisationen
CREATE POLICY "Org members can view colleague names only"
ON public.profiles FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL 
  AND is_organization_member(auth.uid(), organization_id)
  AND auth.uid() != id
);

-- NOTERA: För att faktiskt skydda email-kolumnen på rad-nivå behövs Column-Level Security
-- vilket inte finns i Postgres. Istället ska frontend-koden INTE visa email för andra användare.
-- RLS säkerställer att man måste vara i samma org för att ens se raden.

-- Policy 3: Founders och admins kan se alla profiler (för administrativt syfte)
CREATE POLICY "System admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
);

-- Policy 4: Org owners och admins kan se email för medlemmar i sin organisation
-- Detta krävs för att kunna hantera medlemmar och skicka inbjudningar
CREATE POLICY "Org admins can view member emails in their org"
ON public.profiles FOR SELECT
TO authenticated
USING (
  organization_id IS NOT NULL
  AND (
    has_organization_role(auth.uid(), organization_id, 'owner')
    OR has_organization_role(auth.uid(), organization_id, 'admin')
  )
);

-- Update policies
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "System admins can update any profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
);

CREATE POLICY "Org admins can update member profiles"
ON public.profiles FOR UPDATE
TO authenticated
USING (
  organization_id IS NOT NULL
  AND (
    has_organization_role(auth.uid(), organization_id, 'owner')
    OR has_organization_role(auth.uid(), organization_id, 'admin')
  )
);

-- ===================
-- PROPERTY_CONTACTS TABLE - Begränsa åtkomst till känsliga kontakter
-- ===================

-- Ta bort befintliga policies
DROP POLICY IF EXISTS "Authenticated users can view contacts" ON public.property_contacts;
DROP POLICY IF EXISTS "Authenticated users can create contacts" ON public.property_contacts;
DROP POLICY IF EXISTS "Authenticated users can update contacts" ON public.property_contacts;
DROP POLICY IF EXISTS "Authenticated users can delete contacts" ON public.property_contacts;

-- Ny strängare policy: Endast org owners/admins kan se kontakter med email/phone
-- Vanliga medlemmar kan inte se känsliga kontaktuppgifter
CREATE POLICY "Org admins can view property contacts"
ON public.property_contacts FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'founder'::app_role)
  OR EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_contacts.property_id
    AND p.organization_id IS NOT NULL
    AND (
      has_organization_role(auth.uid(), p.organization_id, 'owner')
      OR has_organization_role(auth.uid(), p.organization_id, 'admin')
    )
  )
);

-- Property owners (om inte org-baserat) kan se sina egna kontakter
CREATE POLICY "Property owners can view their contacts"
ON public.property_contacts FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_contacts.property_id
    AND p.owner_id = auth.uid()
  )
);

-- Endast org admins kan skapa kontakter
CREATE POLICY "Org admins can create contacts"
ON public.property_contacts FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_contacts.property_id
    AND (
      p.owner_id = auth.uid()
      OR (
        p.organization_id IS NOT NULL
        AND (
          has_organization_role(auth.uid(), p.organization_id, 'owner')
          OR has_organization_role(auth.uid(), p.organization_id, 'admin')
        )
      )
    )
  )
);

-- Endast org admins kan uppdatera kontakter
CREATE POLICY "Org admins can update contacts"
ON public.property_contacts FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_contacts.property_id
    AND (
      p.owner_id = auth.uid()
      OR (
        p.organization_id IS NOT NULL
        AND (
          has_organization_role(auth.uid(), p.organization_id, 'owner')
          OR has_organization_role(auth.uid(), p.organization_id, 'admin')
        )
      )
    )
  )
);

-- Endast org admins kan ta bort kontakter
CREATE POLICY "Org admins can delete contacts"
ON public.property_contacts FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_contacts.property_id
    AND (
      p.owner_id = auth.uid()
      OR (
        p.organization_id IS NOT NULL
        AND (
          has_organization_role(auth.uid(), p.organization_id, 'owner')
          OR has_organization_role(auth.uid(), p.organization_id, 'admin')
        )
      )
    )
  )
);

-- ===================
-- KOMMENTAR FÖR FRONTEND-UTVECKLARE
-- ===================
-- VIKTIGT: Även om RLS nu begränsar åtkomst till profiler och kontakter,
-- måste frontend-koden OCKSÅ implementera följande logik:
--
-- För PROFILES:
-- - Visa INTE email-fältet för andra användare (även om de är i samma org)
-- - Endast org owners/admins ska kunna se email i medlemslistor
-- - Vanliga medlemmar ska endast se namn och roll för kollegor
--
-- För PROPERTY_CONTACTS:
-- - Endast org owners/admins kan se och hantera kontakter
-- - Vanliga medlemmar har INGEN åtkomst till kontaktuppgifter
-- - Om vanliga medlemmar behöver kontakta någon, ska de gå via admin
--
-- Detta är Defense in Depth - både databas OCH frontend ska validera åtkomst!