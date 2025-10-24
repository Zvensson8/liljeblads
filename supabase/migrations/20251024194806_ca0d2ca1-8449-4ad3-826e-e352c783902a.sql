-- Skapa tabeller för dynamiskt kategorisystem

-- Kategorier för teknisk information
CREATE TABLE property_info_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Fält inom varje kategori
CREATE TABLE property_info_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES property_info_categories(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'date', 'boolean', 'select', 'textarea')),
  options JSONB,
  unit TEXT,
  placeholder TEXT,
  help_text TEXT,
  display_order INTEGER DEFAULT 0,
  required BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Värden per fastighet
CREATE TABLE property_info_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES property_info_fields(id) ON DELETE CASCADE,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(property_id, field_id)
);

-- Indexes för prestanda
CREATE INDEX idx_property_info_categories_org ON property_info_categories(organization_id);
CREATE INDEX idx_property_info_fields_category ON property_info_fields(category_id);
CREATE INDEX idx_property_info_values_property ON property_info_values(property_id);
CREATE INDEX idx_property_info_values_field ON property_info_values(field_id);

-- Trigger för updated_at
CREATE TRIGGER set_timestamp_property_info_categories
  BEFORE UPDATE ON property_info_categories
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

CREATE TRIGGER set_timestamp_property_info_fields
  BEFORE UPDATE ON property_info_fields
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- RLS Policies för property_info_categories
ALTER TABLE property_info_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view categories in their organization"
  ON property_info_categories FOR SELECT
  USING (is_organization_member(auth.uid(), organization_id));

CREATE POLICY "Organization admins can manage categories"
  ON property_info_categories FOR ALL
  USING (
    has_organization_role(auth.uid(), organization_id, 'owner') OR 
    has_organization_role(auth.uid(), organization_id, 'admin')
  );

-- RLS Policies för property_info_fields
ALTER TABLE property_info_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view fields in their organization"
  ON property_info_fields FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM property_info_categories c
      WHERE c.id = property_info_fields.category_id
      AND is_organization_member(auth.uid(), c.organization_id)
    )
  );

CREATE POLICY "Organization admins can manage fields"
  ON property_info_fields FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM property_info_categories c
      WHERE c.id = property_info_fields.category_id
      AND (
        has_organization_role(auth.uid(), c.organization_id, 'owner') OR 
        has_organization_role(auth.uid(), c.organization_id, 'admin')
      )
    )
  );

-- RLS Policies för property_info_values
ALTER TABLE property_info_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view values for accessible properties"
  ON property_info_values FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_info_values.property_id
      AND (
        p.owner_id = auth.uid() OR
        (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id)) OR
        has_role(auth.uid(), 'admin')
      )
    )
  );

CREATE POLICY "Users can manage values for accessible properties"
  ON property_info_values FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_info_values.property_id
      AND (
        p.owner_id = auth.uid() OR
        (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
      )
    )
  );

-- Seed data funktion
CREATE OR REPLACE FUNCTION seed_default_property_info_categories(org_id UUID)
RETURNS void AS $$
DECLARE
  cat_tech UUID;
  cat_construction UUID;
  cat_access UUID;
  cat_environment UUID;
  cat_areas UUID;
  cat_admin UUID;
BEGIN
  -- Tekniska system
  INSERT INTO property_info_categories (organization_id, name, description, icon, display_order)
  VALUES (org_id, 'Tekniska system', 'Information om tekniska installationer', 'Wrench', 1)
  RETURNING id INTO cat_tech;
  
  INSERT INTO property_info_fields (category_id, field_name, field_type, placeholder, display_order) VALUES
  (cat_tech, 'Värmesystem', 'select', 'Välj typ', 0),
  (cat_tech, 'Värmesystem ålder', 'number', 'Antal år', 1),
  (cat_tech, 'Senaste service värmesystem', 'date', '', 2),
  (cat_tech, 'Ventilationstyp', 'select', 'Välj typ', 3),
  (cat_tech, 'Huvudsäkring', 'number', 'kWh', 4),
  (cat_tech, 'VA-system', 'select', 'Välj typ', 5),
  (cat_tech, 'Fettavskiljare', 'boolean', '', 6),
  (cat_tech, 'Fettavskiljare storlek', 'text', 't.ex. 5000L', 7),
  (cat_tech, 'Senaste tömning fettavskiljare', 'date', '', 8),
  (cat_tech, 'Antal hissar', 'number', '', 9),
  (cat_tech, 'Hisstyp', 'text', '', 10);
  
  UPDATE property_info_fields SET options = '["Fjärrvärme", "Bergvärme", "Luftvärmepump", "Elpannor", "Olja", "Annat"]'::jsonb
  WHERE category_id = cat_tech AND field_name = 'Värmesystem';
  
  UPDATE property_info_fields SET options = '["FTX", "F", "S", "Mekanisk", "Naturlig", "Annat"]'::jsonb
  WHERE category_id = cat_tech AND field_name = 'Ventilationstyp';
  
  UPDATE property_info_fields SET options = '["Kommunalt", "Enskilt", "Gemensamt"]'::jsonb
  WHERE category_id = cat_tech AND field_name = 'VA-system';

  -- Konstruktion
  INSERT INTO property_info_categories (organization_id, name, description, icon, display_order)
  VALUES (org_id, 'Konstruktion', 'Byggnadsteknisk information', 'Building', 2)
  RETURNING id INTO cat_construction;
  
  INSERT INTO property_info_fields (category_id, field_name, field_type, placeholder, display_order) VALUES
  (cat_construction, 'Stomme', 'select', 'Välj typ', 0),
  (cat_construction, 'Fasadtyp', 'select', 'Välj typ', 1),
  (cat_construction, 'Taktyp', 'select', 'Välj typ', 2),
  (cat_construction, 'Takbeläggning', 'text', '', 3),
  (cat_construction, 'Antal fönster', 'number', '', 4),
  (cat_construction, 'Fönstertyp', 'text', '', 5),
  (cat_construction, 'Fönster senaste byte', 'number', 'År', 6),
  (cat_construction, 'Grundläggning', 'text', '', 7);
  
  UPDATE property_info_fields SET options = '["Betong", "Trä", "Stål", "Tegel", "Blandat", "Annat"]'::jsonb
  WHERE category_id = cat_construction AND field_name = 'Stomme';
  
  UPDATE property_info_fields SET options = '["Tegel", "Puts", "Trä", "Plåt", "Glas", "Annat"]'::jsonb
  WHERE category_id = cat_construction AND field_name = 'Fasadtyp';
  
  UPDATE property_info_fields SET options = '["Platt tak", "Sadeltak", "Pulpettak", "Valmat tak", "Annat"]'::jsonb
  WHERE category_id = cat_construction AND field_name = 'Taktyp';

  -- Tillgänglighet & säkerhet
  INSERT INTO property_info_categories (organization_id, name, description, icon, display_order)
  VALUES (org_id, 'Tillgänglighet & säkerhet', 'Säkerhetssystem och åtkomst', 'Lock', 3)
  RETURNING id INTO cat_access;
  
  INSERT INTO property_info_fields (category_id, field_name, field_type, placeholder, display_order) VALUES
  (cat_access, 'Antal bommar', 'number', '', 0),
  (cat_access, 'Portkoder', 'textarea', 'Känslig information', 1),
  (cat_access, 'Brandlarmstyp', 'text', '', 2),
  (cat_access, 'Brandlarm testschema', 'text', '', 3),
  (cat_access, 'Larm/övervakningssystem', 'text', '', 4),
  (cat_access, 'Tillgänglighetsanpassad', 'boolean', '', 5);

  -- Miljö & energi
  INSERT INTO property_info_categories (organization_id, name, description, icon, display_order)
  VALUES (org_id, 'Miljö & energi', 'Energiklass och miljöåtgärder', 'Leaf', 4)
  RETURNING id INTO cat_environment;
  
  INSERT INTO property_info_fields (category_id, field_name, field_type, placeholder, display_order) VALUES
  (cat_environment, 'Energiklass', 'select', 'Välj klass', 0),
  (cat_environment, 'Solceller', 'boolean', '', 1),
  (cat_environment, 'Solceller kapacitet', 'number', 'kW', 2),
  (cat_environment, 'Avfallshantering', 'text', '', 3),
  (cat_environment, 'Hämtningsschema avfall', 'text', '', 4);
  
  UPDATE property_info_fields SET options = '["A", "B", "C", "D", "E", "F", "G"]'::jsonb
  WHERE category_id = cat_environment AND field_name = 'Energiklass';

  -- Ytor & områden
  INSERT INTO property_info_categories (organization_id, name, description, icon, display_order)
  VALUES (org_id, 'Ytor & områden', 'Parkeringar och gemensamma utrymmen', 'Map', 5)
  RETURNING id INTO cat_areas;
  
  INSERT INTO property_info_fields (category_id, field_name, field_type, placeholder, display_order, unit) VALUES
  (cat_areas, 'Antal parkeringsplatser', 'number', '', 0, 'st'),
  (cat_areas, 'Parkeringstyp', 'select', 'Välj typ', 1, NULL),
  (cat_areas, 'Antal förråd', 'number', '', 2, 'st'),
  (cat_areas, 'Förråd lokalisering', 'text', '', 3, NULL),
  (cat_areas, 'Grönytor storlek', 'number', '', 4, 'm²'),
  (cat_areas, 'Grönytor skötselansvar', 'text', '', 5, NULL);
  
  UPDATE property_info_fields SET options = '["Utomhus", "Garage", "Carport", "Blandat"]'::jsonb
  WHERE category_id = cat_areas AND field_name = 'Parkeringstyp';

  -- Administrativa uppgifter
  INSERT INTO property_info_categories (organization_id, name, description, icon, display_order)
  VALUES (org_id, 'Administrativa uppgifter', 'Försäkringar och administrativa detaljer', 'FileText', 6)
  RETURNING id INTO cat_admin;
  
  INSERT INTO property_info_fields (category_id, field_name, field_type, placeholder, display_order, unit) VALUES
  (cat_admin, 'Försäkringsbolag', 'text', '', 0, NULL),
  (cat_admin, 'Försäkringspolicynummer', 'text', '', 1, NULL),
  (cat_admin, 'Försäkringsmäklare', 'text', '', 2, NULL),
  (cat_admin, 'Försäkringsmäklare kontakt', 'text', 'E-post eller telefon', 3, NULL),
  (cat_admin, 'Taxeringsvärde', 'number', '', 4, 'kr'),
  (cat_admin, 'Senaste besiktning', 'date', '', 5, NULL),
  (cat_admin, 'Övrigt', 'textarea', 'Övrig information', 6, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger för att seeda kategorier när organisation skapas
CREATE OR REPLACE FUNCTION seed_org_property_info()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_default_property_info_categories(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trigger_seed_org_property_info
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION seed_org_property_info();