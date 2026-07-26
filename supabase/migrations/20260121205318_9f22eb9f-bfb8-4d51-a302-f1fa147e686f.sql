-- Tabell för AI-föreslagna åtgärder
CREATE TABLE public.ai_suggested_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.ai_messages(id) ON DELETE SET NULL,
  
  -- Åtgärdstyp och målentitet
  action_type TEXT NOT NULL CHECK (action_type IN (
    'create_work_order',
    'schedule_maintenance', 
    'create_todo',
    'send_reminder',
    'update_component_status',
    'create_project'
  )),
  target_table TEXT,
  target_id UUID,
  
  -- Data för åtgärden
  payload JSONB NOT NULL DEFAULT '{}',
  
  -- AI:ns beslutsgrund
  confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  reasoning TEXT,
  
  -- Status och spårning
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'approved',
    'rejected',
    'executed',
    'failed'
  )),
  
  -- Användarbeslut
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  
  -- Utförandedetaljer
  executed_at TIMESTAMPTZ,
  execution_result JSONB,
  execution_error TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index för snabba sökningar
CREATE INDEX idx_ai_actions_org ON public.ai_suggested_actions(organization_id);
CREATE INDEX idx_ai_actions_status ON public.ai_suggested_actions(status);
CREATE INDEX idx_ai_actions_conversation ON public.ai_suggested_actions(conversation_id);
CREATE INDEX idx_ai_actions_created ON public.ai_suggested_actions(created_at DESC);

-- Trigger för updated_at
CREATE TRIGGER update_ai_suggested_actions_updated_at
  BEFORE UPDATE ON public.ai_suggested_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable RLS
ALTER TABLE public.ai_suggested_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their organization's actions"
  ON public.ai_suggested_actions FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert actions for their organization"
  ON public.ai_suggested_actions FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update their organization's actions"
  ON public.ai_suggested_actions FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can delete their organization's actions"
  ON public.ai_suggested_actions FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE id = auth.uid()
  ));