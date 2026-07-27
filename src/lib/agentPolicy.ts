/**
 * Organization agent / risk-suggestion policy (defaults + apply helpers).
 */

import type { ComponentRiskResult, Confidence, RiskLevel } from '@/lib/componentRisk';
import { riskLevelMeetsMin, confidenceMeetsMin } from '@/lib/componentRisk';

export interface AgentRiskPolicy {
  organization_id: string;
  risk_suggest_enabled: boolean;
  min_risk_level: RiskLevel;
  min_confidence: Confidence;
  /** null = all types */
  included_component_types: string[] | null;
  excluded_component_types: string[];
  max_suggestions_per_run: number;
  auto_create_work_orders: boolean;
}

export const DEFAULT_AGENT_POLICY: Omit<AgentRiskPolicy, 'organization_id'> = {
  risk_suggest_enabled: true,
  min_risk_level: 'high',
  min_confidence: 'medium',
  included_component_types: null,
  excluded_component_types: [],
  max_suggestions_per_run: 20,
  auto_create_work_orders: false,
};

/** Common SC types for policy multi-select */
export const POLICY_COMPONENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'SC1', label: 'SC1 Styr' },
  { value: 'SC4.5.1', label: 'SC4.5.1 Kyla' },
  { value: 'SC4.6.2.6', label: 'SC4.6.2.6 Värmepump' },
  { value: 'SC4.7', label: 'SC4.7 Vent' },
  { value: 'SC4.1.6.9', label: 'SC4.1.6.9 Fjärrvärme' },
  { value: 'SC7.1', label: 'SC7.1 Hiss' },
  { value: 'SC7.2', label: 'SC7.2 Rulltrappa' },
  { value: 'SC2.3.4', label: 'SC2.3.4 Maskinport' },
  { value: 'SC5.5', label: 'SC5.5 Nödkraft' },
];

export function normalizePolicy(
  orgId: string,
  row?: Partial<AgentRiskPolicy> | null,
): AgentRiskPolicy {
  return {
    organization_id: orgId,
    risk_suggest_enabled:
      row?.risk_suggest_enabled ?? DEFAULT_AGENT_POLICY.risk_suggest_enabled,
    min_risk_level: (row?.min_risk_level as RiskLevel) ?? DEFAULT_AGENT_POLICY.min_risk_level,
    min_confidence: (row?.min_confidence as Confidence) ?? DEFAULT_AGENT_POLICY.min_confidence,
    included_component_types:
      row?.included_component_types === undefined
        ? DEFAULT_AGENT_POLICY.included_component_types
        : row.included_component_types,
    excluded_component_types:
      row?.excluded_component_types ?? DEFAULT_AGENT_POLICY.excluded_component_types,
    max_suggestions_per_run:
      row?.max_suggestions_per_run ?? DEFAULT_AGENT_POLICY.max_suggestions_per_run,
    auto_create_work_orders:
      row?.auto_create_work_orders ?? DEFAULT_AGENT_POLICY.auto_create_work_orders,
  };
}

export function typeAllowedByPolicy(
  componentType: string | null | undefined,
  policy: AgentRiskPolicy,
): boolean {
  const t = componentType || '';
  if (policy.excluded_component_types?.includes(t)) return false;
  if (policy.included_component_types == null) return true;
  if (policy.included_component_types.length === 0) return false;
  return policy.included_component_types.includes(t);
}

/** Filter risk results according to org policy */
export function applyPolicyToRisks(
  risks: ComponentRiskResult[],
  policy: AgentRiskPolicy,
): { allowed: ComponentRiskResult[]; skippedPolicy: number } {
  if (!policy.risk_suggest_enabled) {
    return { allowed: [], skippedPolicy: risks.length };
  }

  let skippedPolicy = 0;
  const allowed = risks.filter((r) => {
    if (!riskLevelMeetsMin(r.riskLevel, policy.min_risk_level)) {
      skippedPolicy += 1;
      return false;
    }
    if (!confidenceMeetsMin(r.confidence, policy.min_confidence)) {
      skippedPolicy += 1;
      return false;
    }
    if (!typeAllowedByPolicy(r.type, policy)) {
      skippedPolicy += 1;
      return false;
    }
    return true;
  });

  return {
    allowed: allowed.slice(0, policy.max_suggestions_per_run * 2),
    skippedPolicy,
  };
}
