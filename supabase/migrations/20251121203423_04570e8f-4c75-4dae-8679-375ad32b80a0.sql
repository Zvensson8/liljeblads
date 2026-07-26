-- Fas 1: Skapa alla nya tabeller för förbättringsplanen

-- 1. Dashboard Layouts (för widget-system)
CREATE TABLE IF NOT EXISTS public.dashboard_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  layout JSONB NOT NULL DEFAULT '[]'::jsonb,
  widgets JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Property Locations (för Google Maps)
CREATE TABLE IF NOT EXISTS public.property_locations (
  property_id UUID PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  latitude NUMERIC(10, 8),
  longitude NUMERIC(11, 8),
  formatted_address TEXT,
  last_geocoded TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Audit Logs (för säkerhet & compliance)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. User Consents (för GDPR)
CREATE TABLE IF NOT EXISTS public.user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  consent_type TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT false,
  granted_at TIMESTAMP WITH TIME ZONE,
  revoked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. Scheduled Reports (för rapport-automation)
CREATE TABLE IF NOT EXISTS public.scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  report_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  schedule TEXT NOT NULL, -- cron expression
  recipients TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN DEFAULT true,
  last_run TIMESTAMP WITH TIME ZONE,
  next_run TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Skapa index för bättre prestanda
CREATE INDEX IF NOT EXISTS idx_dashboard_layouts_user_id ON public.dashboard_layouts(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON public.audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_user_id ON public.user_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_run ON public.scheduled_reports(next_run) WHERE is_active = true;

-- RLS Policies för dashboard_layouts
ALTER TABLE public.dashboard_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own dashboard layouts"
  ON public.dashboard_layouts
  FOR ALL
  USING (auth.uid() = user_id);

-- RLS Policies för property_locations
ALTER TABLE public.property_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view property locations for accessible properties"
  ON public.property_locations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_locations.property_id
      AND (
        p.owner_id = auth.uid()
        OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
        OR has_role(auth.uid(), 'admin'::app_role)
      )
    )
  );

CREATE POLICY "Users can manage property locations for their properties"
  ON public.property_locations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM properties p
      WHERE p.id = property_locations.property_id
      AND (
        p.owner_id = auth.uid()
        OR (p.organization_id IS NOT NULL AND is_organization_member(auth.uid(), p.organization_id))
      )
    )
  );

-- RLS Policies för audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and founders can view all audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'founder'::app_role)
  );

CREATE POLICY "Organization admins can view their org's audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.organization_id IS NOT NULL
      AND (
        has_organization_role(auth.uid(), p.organization_id, 'owner'::text)
        OR has_organization_role(auth.uid(), p.organization_id, 'admin'::text)
      )
    )
  );

-- RLS Policies för user_consents
ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own consents"
  ON public.user_consents
  FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all consents"
  ON public.user_consents
  FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'founder'::app_role)
  );

-- RLS Policies för scheduled_reports
ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization members can view their org's scheduled reports"
  ON public.scheduled_reports
  FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND is_organization_member(auth.uid(), organization_id)
  );

CREATE POLICY "Organization admins can manage scheduled reports"
  ON public.scheduled_reports
  FOR ALL
  USING (
    organization_id IS NOT NULL
    AND (
      has_organization_role(auth.uid(), organization_id, 'owner'::text)
      OR has_organization_role(auth.uid(), organization_id, 'admin'::text)
    )
  );

-- Trigger för updated_at på nya tabeller
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_dashboard_layouts_updated_at
  BEFORE UPDATE ON public.dashboard_layouts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_property_locations_updated_at
  BEFORE UPDATE ON public.property_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_consents_updated_at
  BEFORE UPDATE ON public.user_consents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scheduled_reports_updated_at
  BEFORE UPDATE ON public.scheduled_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();