-- Uppdatera project_type enum: byt 'renovering' till 'investering'
ALTER TYPE project_type RENAME VALUE 'renovering' TO 'investering';

-- Lägg till admin-inställning för simuleringsfunktion
CREATE TABLE IF NOT EXISTS public.admin_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage settings
CREATE POLICY "Admins can manage settings"
ON public.admin_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Everyone can view settings
CREATE POLICY "Everyone can view settings"
ON public.admin_settings
FOR SELECT
USING (true);

-- Insert default setting for simulation visibility
INSERT INTO public.admin_settings (setting_key, setting_value)
VALUES ('show_project_simulation', '{"enabled": true}'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;