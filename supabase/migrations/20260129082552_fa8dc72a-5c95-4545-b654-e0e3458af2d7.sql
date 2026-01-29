-- API Keys table for external integrations like Twin.so
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL,
  permissions JSONB DEFAULT '["create_work_order", "create_todo", "create_project", "list_properties", "list_components"]'::jsonb,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);

-- Index for fast key lookup
CREATE UNIQUE INDEX api_keys_key_hash_idx ON public.api_keys(key_hash);
CREATE INDEX api_keys_organization_id_idx ON public.api_keys(organization_id);

-- Enable RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- Policy: Organization admins/owners can manage API keys
CREATE POLICY "Organization admins can manage API keys"
ON public.api_keys
FOR ALL
USING (
  has_organization_role(auth.uid(), organization_id, 'owner') OR
  has_organization_role(auth.uid(), organization_id, 'admin') OR
  has_role(auth.uid(), 'founder'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  has_organization_role(auth.uid(), organization_id, 'owner') OR
  has_organization_role(auth.uid(), organization_id, 'admin') OR
  has_role(auth.uid(), 'founder'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- Add comment for documentation
COMMENT ON TABLE public.api_keys IS 'Stores API keys for external integrations like Twin.so. Keys are stored as SHA-256 hashes for security.';