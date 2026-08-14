-- Optional EnergyPulse bridge so Jarvis can read energy/MEPS/CRREM.
ALTER TABLE public.organization_jarvis_settings
  ADD COLUMN IF NOT EXISTS energypulse_base_url text,
  ADD COLUMN IF NOT EXISTS energypulse_bridge_secret text;

COMMENT ON COLUMN public.organization_jarvis_settings.energypulse_base_url IS
  'Public EnergyPulse origin, e.g. https://energypulse.example.com';
COMMENT ON COLUMN public.organization_jarvis_settings.energypulse_bridge_secret IS
  'Shared secret matching EnergyPulse ENERGYPULSE_BRIDGE_SECRET.';
