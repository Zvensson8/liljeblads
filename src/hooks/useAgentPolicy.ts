import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  normalizePolicy,
  type AgentRiskPolicy,
} from '@/lib/agentPolicy';
import { toast } from 'sonner';

export function useAgentPolicy(organizationId: string | undefined | null) {
  const { session } = useAuth();

  return useQuery({
    queryKey: ['agent-policy', organizationId ?? 'none'],
    queryFn: async (): Promise<AgentRiskPolicy> => {
      const { data, error } = await (supabase as any)
        .from('organization_agent_policies')
        .select('*')
        .eq('organization_id', organizationId!)
        .maybeSingle();

      if (error) throw error;
      return normalizePolicy(organizationId!, data);
    },
    enabled: !!session && !!organizationId,
    staleTime: 1000 * 60 * 5,
  });
}

export function useSaveAgentPolicy() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (policy: AgentRiskPolicy) => {
      const { error } = await (supabase as any)
        .from('organization_agent_policies')
        .upsert(
          {
            organization_id: policy.organization_id,
            risk_suggest_enabled: policy.risk_suggest_enabled,
            min_risk_level: policy.min_risk_level,
            min_confidence: policy.min_confidence,
            included_component_types: policy.included_component_types,
            excluded_component_types: policy.excluded_component_types,
            max_suggestions_per_run: policy.max_suggestions_per_run,
            auto_create_work_orders: policy.auto_create_work_orders,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id' },
        );
      if (error) throw error;
      return policy;
    },
    onSuccess: (policy) => {
      qc.invalidateQueries({ queryKey: ['agent-policy', policy.organization_id] });
      toast.success('Agentpolicy sparad');
    },
    onError: (e: Error) => {
      toast.error(e.message || 'Kunde inte spara policy');
    },
  });
}
