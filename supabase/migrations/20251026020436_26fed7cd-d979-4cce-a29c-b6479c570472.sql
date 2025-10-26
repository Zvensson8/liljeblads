-- Create project_templates table for organization-level templates
CREATE TABLE public.project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('investering', 'underhall', 'energi', 'annat')),
  default_budget NUMERIC,
  checklist_items JSONB DEFAULT '[]'::jsonb,
  budget_categories JSONB DEFAULT '[]'::jsonb,
  estimated_duration_quarters INTEGER,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.project_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view templates in their organization"
  ON public.project_templates
  FOR SELECT
  USING (is_organization_member(auth.uid(), organization_id));

CREATE POLICY "Organization admins can manage templates"
  ON public.project_templates
  FOR ALL
  USING (
    has_organization_role(auth.uid(), organization_id, 'admin') 
    OR has_organization_role(auth.uid(), organization_id, 'owner')
  );

CREATE POLICY "Founders can manage all templates"
  ON public.project_templates
  FOR ALL
  USING (has_role(auth.uid(), 'founder'));

-- Add trigger for updated_at
CREATE TRIGGER update_project_templates_updated_at
  BEFORE UPDATE ON public.project_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Seed default templates for existing organizations
DO $$
DECLARE
  org_record RECORD;
BEGIN
  FOR org_record IN SELECT id FROM public.organizations LOOP
    -- Fasadrenovering template
    INSERT INTO public.project_templates (
      organization_id, name, description, type, default_budget, 
      estimated_duration_quarters, checklist_items, budget_categories
    ) VALUES (
      org_record.id,
      'Fasadrenovering',
      'Mall för renovering av fasad inklusive puts, målning och reparationer',
      'underhall',
      500000,
      2,
      '[
        {"title": "Besiktning av fasad", "description": "Genomför initial besiktning", "responsible": "", "deadline_offset_days": 7},
        {"title": "Inhämta offerter", "description": "Minst 3 offerter från leverantörer", "responsible": "", "deadline_offset_days": 21},
        {"title": "Ansök om bygglov", "description": "Om nödvändigt", "responsible": "", "deadline_offset_days": 30},
        {"title": "Upphandla entreprenör", "description": "Välj leverantör och teckna kontrakt", "responsible": "", "deadline_offset_days": 45},
        {"title": "Startmöte", "description": "Genomför startmöte med entreprenör", "responsible": "", "deadline_offset_days": 60},
        {"title": "Slutbesiktning", "description": "Genomför slutbesiktning", "responsible": "", "deadline_offset_days": 150}
      ]'::jsonb,
      '[
        {"name": "Material", "estimated_amount": 200000},
        {"name": "Arbetskraft", "estimated_amount": 250000},
        {"name": "Ställningar", "estimated_amount": 30000},
        {"name": "Övrigt", "estimated_amount": 20000}
      ]'::jsonb
    );

    -- Takomläggning template
    INSERT INTO public.project_templates (
      organization_id, name, description, type, default_budget,
      estimated_duration_quarters, checklist_items, budget_categories
    ) VALUES (
      org_record.id,
      'Takomläggning',
      'Mall för byte av takbeläggning och takkonstruktion',
      'underhall',
      800000,
      3,
      '[
        {"title": "Takbesiktning", "description": "Besiktning av befintligt tak", "responsible": "", "deadline_offset_days": 7},
        {"title": "Fuktmätning", "description": "Kontrollera fuktskador", "responsible": "", "deadline_offset_days": 14},
        {"title": "Teknisk beskrivning", "description": "Ta fram teknisk beskrivning", "responsible": "", "deadline_offset_days": 30},
        {"title": "Upphandling", "description": "Upphandla takläggare", "responsible": "", "deadline_offset_days": 60},
        {"title": "Rivning gammalt tak", "description": "Demontera befintlig beläggning", "responsible": "", "deadline_offset_days": 90},
        {"title": "Montering nytt tak", "description": "Lägg nytt tak", "responsible": "", "deadline_offset_days": 120},
        {"title": "Slutbesiktning", "description": "Genomför slutbesiktning", "responsible": "", "deadline_offset_days": 180}
      ]'::jsonb,
      '[
        {"name": "Material - takpannor", "estimated_amount": 300000},
        {"name": "Material - isolering", "estimated_amount": 150000},
        {"name": "Arbetskraft", "estimated_amount": 280000},
        {"name": "Ställningar och lyft", "estimated_amount": 50000},
        {"name": "Övrigt", "estimated_amount": 20000}
      ]'::jsonb
    );

    -- Badrumsrenovering template
    INSERT INTO public.project_templates (
      organization_id, name, description, type, default_budget,
      estimated_duration_quarters, checklist_items, budget_categories
    ) VALUES (
      org_record.id,
      'Badrumsrenovering',
      'Mall för totalrenovering av badrum',
      'underhall',
      250000,
      1,
      '[
        {"title": "Planering och design", "description": "Planera layout och material", "responsible": "", "deadline_offset_days": 14},
        {"title": "Fuktskyddskontroll", "description": "Kontrollera befintligt fuktskydd", "responsible": "", "deadline_offset_days": 21},
        {"title": "Beställ material", "description": "Beställ kakel, golvvärme, armatur", "responsible": "", "deadline_offset_days": 30},
        {"title": "Rivning", "description": "Riv befintligt badrum", "responsible": "", "deadline_offset_days": 45},
        {"title": "VVS-installation", "description": "Installera nya rör och avlopp", "responsible": "", "deadline_offset_days": 55},
        {"title": "El-installation", "description": "Ny elinstallation", "responsible": "", "deadline_offset_days": 60},
        {"title": "Montering", "description": "Kakel, golv, armatur", "responsible": "", "deadline_offset_days": 75},
        {"title": "Slutbesiktning", "description": "Genomför slutbesiktning", "responsible": "", "deadline_offset_days": 90}
      ]'::jsonb,
      '[
        {"name": "Material - kakel och klinker", "estimated_amount": 60000},
        {"name": "Material - armatur och dusch", "estimated_amount": 40000},
        {"name": "VVS-arbete", "estimated_amount": 80000},
        {"name": "El-arbete", "estimated_amount": 30000},
        {"name": "Arbetskraft övrigt", "estimated_amount": 30000},
        {"name": "Övrigt", "estimated_amount": 10000}
      ]'::jsonb
    );

    -- Energieffektivisering template
    INSERT INTO public.project_templates (
      organization_id, name, description, type, default_budget,
      estimated_duration_quarters, checklist_items, budget_categories
    ) VALUES (
      org_record.id,
      'Energieffektivisering',
      'Mall för energieffektiviseringsåtgärder',
      'energi',
      400000,
      2,
      '[
        {"title": "Energikartläggning", "description": "Genomför energikartläggning", "responsible": "", "deadline_offset_days": 14},
        {"title": "Energideklaration", "description": "Uppdatera energideklaration", "responsible": "", "deadline_offset_days": 21},
        {"title": "ROT-avdrag ansökan", "description": "Förbered ROT-avdrag", "responsible": "", "deadline_offset_days": 30},
        {"title": "Isolering", "description": "Tilläggsisolering av vindsbjälklag", "responsible": "", "deadline_offset_days": 60},
        {"title": "Fönsterbyte", "description": "Byte till energieffektiva fönster", "responsible": "", "deadline_offset_days": 90},
        {"title": "Ventilationskontroll", "description": "Kontrollera och justera ventilation", "responsible": "", "deadline_offset_days": 100},
        {"title": "Uppföljning", "description": "Mät effekt av åtgärder", "responsible": "", "deadline_offset_days": 150}
      ]'::jsonb,
      '[
        {"name": "Material - isolering", "estimated_amount": 100000},
        {"name": "Material - fönster", "estimated_amount": 180000},
        {"name": "Arbetskraft", "estimated_amount": 100000},
        {"name": "Energikonsult", "estimated_amount": 15000},
        {"name": "Övrigt", "estimated_amount": 5000}
      ]'::jsonb
    );

    -- Ventilationsåtgärd template
    INSERT INTO public.project_templates (
      organization_id, name, description, type, default_budget,
      estimated_duration_quarters, checklist_items, budget_categories
    ) VALUES (
      org_record.id,
      'Ventilationsåtgärd',
      'Mall för ventilationssystem och åtgärder',
      'underhall',
      600000,
      2,
      '[
        {"title": "Ventilationskontroll", "description": "OVK - obligatorisk ventilationskontroll", "responsible": "", "deadline_offset_days": 7},
        {"title": "Teknisk utredning", "description": "Utredning av befintligt system", "responsible": "", "deadline_offset_days": 21},
        {"title": "Projektering", "description": "Projektering av nytt system", "responsible": "", "deadline_offset_days": 45},
        {"title": "Upphandling", "description": "Upphandla ventilationsentreprenör", "responsible": "", "deadline_offset_days": 60},
        {"title": "Installation", "description": "Installera nytt system", "responsible": "", "deadline_offset_days": 120},
        {"title": "Injustering", "description": "Injustera ventilationssystem", "responsible": "", "deadline_offset_days": 135},
        {"title": "Funktionskontroll", "description": "Kontrollera funktion och luftflöden", "responsible": "", "deadline_offset_days": 150}
      ]'::jsonb,
      '[
        {"name": "Ventilationsaggregat", "estimated_amount": 250000},
        {"name": "Kanaler och tillbehör", "estimated_amount": 150000},
        {"name": "Arbetskraft", "estimated_amount": 160000},
        {"name": "Projektering och konsult", "estimated_amount": 30000},
        {"name": "Övrigt", "estimated_amount": 10000}
      ]'::jsonb
    );

    -- ROT-renovering template
    INSERT INTO public.project_templates (
      organization_id, name, description, type, default_budget,
      estimated_duration_quarters, checklist_items, budget_categories
    ) VALUES (
      org_record.id,
      'ROT-renovering',
      'Mall för ROT-avdragsgill renovering',
      'underhall',
      300000,
      2,
      '[
        {"title": "ROT-ansökan", "description": "Ansök om ROT-avdrag hos Skatteverket", "responsible": "", "deadline_offset_days": 7},
        {"title": "Planering", "description": "Planera arbetsmoment", "responsible": "", "deadline_offset_days": 14},
        {"title": "Upphandling", "description": "Upphandla entreprenör med F-skattsedel", "responsible": "", "deadline_offset_days": 30},
        {"title": "Genomförande", "description": "Utför renoveringsarbeten", "responsible": "", "deadline_offset_days": 90},
        {"title": "Fakturering", "description": "Se till att faktura är korrekt för ROT", "responsible": "", "deadline_offset_days": 100},
        {"title": "Skatteverket", "description": "Skicka in underlag till Skatteverket", "responsible": "", "deadline_offset_days": 110}
      ]'::jsonb,
      '[
        {"name": "Arbetskraft (ROT-berättigad)", "estimated_amount": 200000},
        {"name": "Material", "estimated_amount": 80000},
        {"name": "Övrigt", "estimated_amount": 20000}
      ]'::jsonb
    );
  END LOOP;
END $$;