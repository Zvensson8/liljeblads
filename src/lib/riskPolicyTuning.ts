/**
 * Light self-improvement for risk suggestion thresholds.
 *
 * Looks at recent accept/reject outcomes for weibull_risk suggestions and
 * gently adjusts organization_agent_policies.min_risk_level / min_confidence.
 * Never auto-creates work orders. Safe, reversible defaults.
 */

import { supabase } from '@/integrations/supabase/client';
import type { Confidence, RiskLevel } from '@/lib/componentRisk';

const LOOKBACK_DAYS = 60;
const MIN_SAMPLES = 8;

const RISK_ORDER: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
const CONF_ORDER: Confidence[] = ['low', 'medium', 'high'];

function bumpRisk(level: RiskLevel, dir: 1 | -1): RiskLevel {
  const i = RISK_ORDER.indexOf(level);
  const next = Math.min(RISK_ORDER.length - 1, Math.max(0, i + dir));
  return RISK_ORDER[next];
}

function bumpConf(level: Confidence, dir: 1 | -1): Confidence {
  const i = CONF_ORDER.indexOf(level);
  const next = Math.min(CONF_ORDER.length - 1, Math.max(0, i + dir));
  return CONF_ORDER[next];
}

export interface RiskPolicyTuningResult {
  adjusted: boolean;
  samples: number;
  acceptRate: number | null;
  previous?: { min_risk_level: string; min_confidence: string };
  next?: { min_risk_level: string; min_confidence: string };
  reason?: string;
}

/**
 * Call after a human accepts/rejects a weibull risk suggestion.
 * Idempotent-ish: only adjusts when enough samples and extreme accept rates.
 */
export async function maybeTuneRiskPolicyFromFeedback(
  organizationId: string,
): Promise<RiskPolicyTuningResult> {
  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);

  const { data: rows, error } = await supabase
    .from('ai_suggested_actions')
    .select('status, payload, created_at')
    .eq('organization_id', organizationId)
    .eq('action_type', 'create_work_order')
    .in('status', ['rejected', 'executed', 'approved'])
    .gte('created_at', since.toISOString())
    .limit(200);

  if (error) {
    console.warn('riskPolicyTuning: load actions failed', error);
    return { adjusted: false, samples: 0, acceptRate: null, reason: error.message };
  }

  const relevant = (rows ?? []).filter((r) => {
    const p = r.payload as { source?: string } | null;
    return p?.source === 'weibull_risk';
  });

  const samples = relevant.length;
  if (samples < MIN_SAMPLES) {
    return {
      adjusted: false,
      samples,
      acceptRate: null,
      reason: `need_at_least_${MIN_SAMPLES}_samples`,
    };
  }

  const accepted = relevant.filter(
    (r) => r.status === 'executed' || r.status === 'approved',
  ).length;
  const rejected = relevant.filter((r) => r.status === 'rejected').length;
  const decided = accepted + rejected;
  if (decided < MIN_SAMPLES) {
    return {
      adjusted: false,
      samples: decided,
      acceptRate: null,
      reason: 'not_enough_decided',
    };
  }

  const acceptRate = accepted / decided;

  const { data: policy, error: pErr } = await (supabase as any)
    .from('organization_agent_policies')
    .select('organization_id, min_risk_level, min_confidence')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (pErr) {
    return { adjusted: false, samples: decided, acceptRate, reason: pErr.message };
  }

  const prevLevel = (policy?.min_risk_level as RiskLevel) || 'high';
  const prevConf = (policy?.min_confidence as Confidence) || 'medium';
  let nextLevel = prevLevel;
  let nextConf = prevConf;
  let reason = 'stable';

  // Too many rejections → raise the bar (fewer noisy suggestions)
  if (acceptRate < 0.25) {
    nextLevel = bumpRisk(prevLevel, 1);
    if (nextLevel === prevLevel) nextConf = bumpConf(prevConf, 1);
    reason = 'low_accept_rate_raise_threshold';
  }
  // Very high acceptance → slightly lower bar (catch more)
  else if (acceptRate > 0.85 && prevLevel !== 'medium') {
    nextLevel = bumpRisk(prevLevel, -1);
    reason = 'high_accept_rate_lower_threshold';
  }

  if (nextLevel === prevLevel && nextConf === prevConf) {
    return {
      adjusted: false,
      samples: decided,
      acceptRate,
      previous: { min_risk_level: prevLevel, min_confidence: prevConf },
      reason,
    };
  }

  const { error: upErr } = await (supabase as any)
    .from('organization_agent_policies')
    .upsert(
      {
        organization_id: organizationId,
        min_risk_level: nextLevel,
        min_confidence: nextConf,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' },
    );

  if (upErr) {
    return {
      adjusted: false,
      samples: decided,
      acceptRate,
      reason: upErr.message,
    };
  }

  return {
    adjusted: true,
    samples: decided,
    acceptRate,
    previous: { min_risk_level: prevLevel, min_confidence: prevConf },
    next: { min_risk_level: nextLevel, min_confidence: nextConf },
    reason,
  };
}
