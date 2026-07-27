import { describe, expect, it } from 'vitest';
import {
  applyPolicyToRisks,
  DEFAULT_AGENT_POLICY,
  normalizePolicy,
  typeAllowedByPolicy,
} from '@/lib/agentPolicy';
import type { ComponentRiskResult } from '@/lib/componentRisk';

const baseRisk = {
  ageYears: 10,
  params: { shape: 2, scale: 15, n: 0, method: 'prior' as const },
  reliability: 0.5,
  failureProbability: 0.5,
  hazardRate: 0.1,
  medianLifeYears: 12,
  remainingB10Years: 2,
  acuteCount: 0,
  recommendation: 'x',
  confidence: 'medium' as const,
};

describe('agentPolicy', () => {
  it('normalizePolicy fills defaults', () => {
    const p = normalizePolicy('org1', null);
    expect(p.organization_id).toBe('org1');
    expect(p.min_risk_level).toBe(DEFAULT_AGENT_POLICY.min_risk_level);
    expect(p.risk_suggest_enabled).toBe(true);
  });

  it('typeAllowedByPolicy excludes listed types', () => {
    const p = normalizePolicy('org1', {
      excluded_component_types: ['SC1'],
      included_component_types: null,
    });
    expect(typeAllowedByPolicy('SC1', p)).toBe(false);
    expect(typeAllowedByPolicy('SC4.7', p)).toBe(true);
  });

  it('applyPolicyToRisks skips when disabled', () => {
    const p = normalizePolicy('org1', { risk_suggest_enabled: false });
    const risks: ComponentRiskResult[] = [
      {
        ...baseRisk,
        componentId: 'a',
        riskScore: 90,
        riskLevel: 'critical',
        type: 'SC1',
      },
    ];
    const { allowed, skippedPolicy } = applyPolicyToRisks(risks, p);
    expect(allowed).toHaveLength(0);
    expect(skippedPolicy).toBe(1);
  });

  it('applyPolicyToRisks filters by min level and type', () => {
    const p = normalizePolicy('org1', {
      min_risk_level: 'high',
      min_confidence: 'medium',
      excluded_component_types: ['SC1'],
    });
    const risks: ComponentRiskResult[] = [
      {
        ...baseRisk,
        componentId: 'a',
        riskScore: 90,
        riskLevel: 'critical',
        type: 'SC1',
        confidence: 'high',
      },
      {
        ...baseRisk,
        componentId: 'b',
        riskScore: 80,
        riskLevel: 'high',
        type: 'SC4.7',
        confidence: 'medium',
      },
      {
        ...baseRisk,
        componentId: 'c',
        riskScore: 20,
        riskLevel: 'low',
        type: 'SC4.7',
        confidence: 'high',
      },
    ];
    const { allowed } = applyPolicyToRisks(risks, p);
    expect(allowed.map((r) => r.componentId)).toEqual(['b']);
  });
});
