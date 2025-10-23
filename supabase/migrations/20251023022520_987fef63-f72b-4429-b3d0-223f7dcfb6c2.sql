-- Create account_codes table
CREATE TABLE public.account_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);

-- Enable RLS
ALTER TABLE public.account_codes ENABLE ROW LEVEL SECURITY;

-- RLS policies for account_codes
CREATE POLICY "Users can view their organization's account codes"
ON public.account_codes
FOR SELECT
USING (is_organization_member(auth.uid(), organization_id));

CREATE POLICY "Organization admins can manage account codes"
ON public.account_codes
FOR ALL
USING (
  has_organization_role(auth.uid(), organization_id, 'owner') OR 
  has_organization_role(auth.uid(), organization_id, 'admin')
);

-- Create recurring_cost_history table
CREATE TABLE public.recurring_cost_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recurring_cost_id UUID NOT NULL REFERENCES public.property_recurring_costs(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  was_actual_payment BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.recurring_cost_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for recurring_cost_history
CREATE POLICY "Users can view history for accessible recurring costs"
ON public.recurring_cost_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM property_recurring_costs prc
    JOIN properties p ON prc.property_id = p.id
    WHERE prc.id = recurring_cost_history.recurring_cost_id
    AND (p.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "Users can manage history for accessible recurring costs"
ON public.recurring_cost_history
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM property_recurring_costs prc
    JOIN properties p ON prc.property_id = p.id
    WHERE prc.id = recurring_cost_history.recurring_cost_id
    AND p.owner_id = auth.uid()
  )
);

-- Update property_recurring_costs table
ALTER TABLE public.property_recurring_costs 
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS frequency,
  ADD COLUMN account_code_id UUID REFERENCES public.account_codes(id) ON DELETE SET NULL,
  ADD COLUMN contractor_name TEXT,
  ADD COLUMN contact_person TEXT,
  ADD COLUMN base_interval_months INTEGER,
  ADD COLUMN interval_variation_months INTEGER DEFAULT 0,
  ADD COLUMN last_payment_date DATE,
  ADD COLUMN calculated_quarter_start TEXT,
  ADD COLUMN calculated_quarter_end TEXT,
  ADD COLUMN user_selected_date DATE;

-- Add trigger for updated_at on account_codes
CREATE TRIGGER update_account_codes_updated_at
BEFORE UPDATE ON public.account_codes
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Seed standard account codes for all existing organizations
INSERT INTO public.account_codes (organization_id, code, description)
SELECT 
  o.id,
  ac.code,
  ac.description
FROM public.organizations o
CROSS JOIN (
  VALUES 
    ('6568', 'Driftkonsulter & miljöcertifiering'),
    ('41009', 'Städ, köpta tjänster Utdeb.hyresg'),
    ('41029', 'Klottersanering Utdeb.hyresg'),
    ('41209', 'Skadedjursbekämpning Utdeb.hyresg'),
    ('46409', 'Avfallshantering Utdeb.hyresg'),
    ('41019', 'Snöröjning, sandning, sopning Utdeb.hyr'),
    ('41259', 'Telefonkostnader Utdeb.hyresg'),
    ('41319', 'Serviceavtal ventilation Utdeb.hyr'),
    ('41329', 'Serviceavtal värmeanläggning Utdeb.hyr'),
    ('41339', 'Serviceavtal kylanläggning Utdeb.hyr'),
    ('41349', 'Serviceavtal styr- & regler Utdeb.hyr'),
    ('41419', 'Serviceavtal övriga installat Utdeb.hyr'),
    ('41509', 'Bevakningskostnader Utdeb.hyresg'),
    ('41519', 'Serviceavtal larm Utdeb.hyr'),
    ('41609', 'Brandskydd Utdeb.hyresg'),
    ('41709', 'Serviceavtal tak Utdeb.hyr'),
    ('41719', 'Serviceavtal portar Utdeb.hyr'),
    ('41809', 'Serviceavtal filter Utdeb.hyr'),
    ('41999', 'Serviceavtal övrigt Utdeb.hyr')
) AS ac(code, description)
ON CONFLICT DO NOTHING;