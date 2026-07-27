/**
 * Generate HITL work-order suggestions from Weibull risk scores.
 * Never creates work orders directly — only ai_suggested_actions.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { ComponentRiskResult } from '@/lib/componentRisk';
import { riskLevelMeetsMin } from '@/lib/componentRisk';
import {
  applyPolicyToRisks,
  normalizePolicy,
  type AgentRiskPolicy,
} from '@/lib/agentPolicy';

const DEDUPE_DAYS = 30;
const DEFAULT_MAX = 20;

export interface GenerateRiskSuggestionsOptions {
  organizationId: string;
  risks: ComponentRiskResult[];
  /** Only high/critical by default (overridden by policy when loaded) */
  minLevel?: 'high' | 'critical' | 'medium';
  /** Skip low-confidence scores (default true) */
  requireMediumConfidence?: boolean;
  maxSuggestions?: number;
  conversationId?: string | null;
  /** If omitted, loaded from organization_agent_policies */
  policy?: AgentRiskPolicy | null;
}

export interface GenerateRiskSuggestionsResult {
  created: number;
  skipped: number;
  ids: string[];
}

function confidenceScore(c: ComponentRiskResult['confidence']): number {
  if (c === 'high') return 0.85;
  if (c === 'medium') return 0.7;
  return 0.45;
}

export async function loadAgentPolicy(
  organizationId: string,
): Promise<AgentRiskPolicy> {
  const { data } = await (supabase as any)
    .from('organization_agent_policies')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle();
  return normalizePolicy(organizationId, data);
}

export async function generateRiskSuggestions(
  opts: GenerateRiskSuggestionsOptions,
): Promise<GenerateRiskSuggestionsResult> {
  const policy =
    opts.policy ?? (await loadAgentPolicy(opts.organizationId));

  if (!policy.risk_suggest_enabled) {
    return { created: 0, skipped: opts.risks.length, ids: [] };
  }

  const max = opts.maxSuggestions ?? policy.max_suggestions_per_run ?? DEFAULT_MAX;

  // Policy first; optional explicit overrides still raise the bar
  const { allowed, skippedPolicy } = applyPolicyToRisks(opts.risks, policy);
  let candidates = allowed;
  if (opts.minLevel) {
    candidates = candidates.filter((r) =>
      riskLevelMeetsMin(r.riskLevel, opts.minLevel),
    );
  }
  if (opts.requireMediumConfidence === false) {
    // keep policy confidence only
  } else if (opts.requireMediumConfidence === true) {
    candidates = candidates.filter((r) => r.confidence !== 'low');
  }
  candidates = candidates.slice(0, max * 2);

  if (!candidates.length) {
    return { created: 0, skipped: skippedPolicy, ids: [] };
  }

  const componentIds = candidates.map((c) => c.componentId);
  const since = new Date();
  since.setDate(since.getDate() - DEDUPE_DAYS);

  const [openWoRes, pendingRes] = await Promise.all([
    supabase
      .from('work_orders')
      .select('component_id, status')
      .in('component_id', componentIds)
      .in('status', ['not_started', 'awaiting_quote', 'ordered']),
    supabase
      .from('ai_suggested_actions')
      .select('id, payload, status, created_at')
      .eq('organization_id', opts.organizationId)
      .eq('action_type', 'create_work_order')
      .in('status', ['pending', 'approved'])
      .gte('created_at', since.toISOString()),
  ]);

  const openWo = new Set(
    (openWoRes.data ?? [])
      .map((w) => w.component_id as string | null)
      .filter(Boolean) as string[],
  );

  const pendingComponents = new Set<string>();
  for (const row of pendingRes.data ?? []) {
    const payload = row.payload as { component_id?: string; source?: string } | null;
    if (payload?.component_id && payload?.source === 'weibull_risk') {
      pendingComponents.add(payload.component_id);
    }
  }

  let skipped = 0;
  const toInsert: Array<{
    organization_id: string;
    conversation_id?: string | null;
    action_type: string;
    status: string;
    confidence_score: number;
    reasoning: string;
    payload: Json;
  }> = [];

  for (const risk of candidates) {
    if (toInsert.length >= max) break;
    if (openWo.has(risk.componentId)) {
      skipped += 1;
      continue;
    }
    if (pendingComponents.has(risk.componentId)) {
      skipped += 1;
      continue;
    }

    const conf = confidenceScore(risk.confidence);
    if (conf < 0.5) {
      skipped += 1;
      continue;
    }

    const actionText = (
      risk.recommendation || `Förebyggande åtgärd för ${risk.name || risk.componentId}`
    ).slice(0, 140);

    toInsert.push({
      organization_id: opts.organizationId,
      conversation_id: opts.conversationId ?? null,
      action_type: 'create_work_order',
      status: 'pending',
      confidence_score: conf,
      reasoning: `Prediktiv risk ${risk.riskScore} (${risk.riskLevel}, confidence ${risk.confidence})`,
      payload: {
        action: actionText,
        property_name: risk.propertyName || undefined,
        component_id: risk.componentId,
        component_name: risk.name,
        priority: risk.riskLevel === 'critical' ? 'high' : 'medium',
        reasoning: `Weibull-baserad prediktiv risk. ${risk.recommendation}`,
        confidence: conf,
        source: 'weibull_risk',
      },
    });
  }

  if (!toInsert.length) {
    return { created: 0, skipped, ids: [] };
  }

  const { data, error } = await supabase
    .from('ai_suggested_actions')
    .insert(toInsert)
    .select('id');

  if (error) throw error;

  return {
    created: data?.length ?? 0,
    skipped: skipped + skippedPolicy,
    ids: (data ?? []).map((r) => r.id as string),
  };
}
