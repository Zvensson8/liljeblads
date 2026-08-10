import { describe, it, expect } from 'vitest';

/**
 * Pure helpers mirrored for unit tests (keep in sync with riskPolicyTuning).
 * Full DB tuning is covered by integration smoke when service role is present.
 */
const RISK_ORDER = ['low', 'medium', 'high', 'critical'] as const;
const CONF_ORDER = ['low', 'medium', 'high'] as const;

function bumpRisk(level: (typeof RISK_ORDER)[number], dir: 1 | -1) {
  const i = RISK_ORDER.indexOf(level);
  return RISK_ORDER[Math.min(RISK_ORDER.length - 1, Math.max(0, i + dir))];
}

function bumpConf(level: (typeof CONF_ORDER)[number], dir: 1 | -1) {
  const i = CONF_ORDER.indexOf(level);
  return CONF_ORDER[Math.min(CONF_ORDER.length - 1, Math.max(0, i + dir))];
}

describe('risk policy threshold bumps', () => {
  it('raises risk level on low accept path', () => {
    expect(bumpRisk('high', 1)).toBe('critical');
    expect(bumpRisk('critical', 1)).toBe('critical');
  });

  it('lowers risk level on high accept path', () => {
    expect(bumpRisk('high', -1)).toBe('medium');
    expect(bumpRisk('low', -1)).toBe('low');
  });

  it('raises confidence when risk already maxed', () => {
    expect(bumpConf('medium', 1)).toBe('high');
    expect(bumpConf('high', 1)).toBe('high');
  });
});
