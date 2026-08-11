import { describe, expect, it } from 'vitest';
import {
  clampBatchSize,
  deepLinkForEntity,
  describeInvoiceAddress,
  findBlockedEmailRecipientField,
  formatBriefingPlainLite,
  isBatchableApplyTool,
  isWithinJarvisUndoWindow,
  JARVIS_BATCH_MAX,
  JARVIS_UNDO_WINDOW_MS,
  prefersDirectApply,
} from './jarvisPolicy';

describe('jarvisPolicy – send_to_me security', () => {
  it('blocks external recipient fields', () => {
    expect(findBlockedEmailRecipientField({ to: 'evil@example.com' })).toBe('to');
    expect(findBlockedEmailRecipientField({ recipient: 'x@y.z' })).toBe('recipient');
    expect(findBlockedEmailRecipientField({ email: 'x@y.z' })).toBe('email');
    expect(findBlockedEmailRecipientField({ subject: 'Hi', body: 'ok' })).toBeNull();
  });
});

describe('jarvisPolicy – grounding invoice_address', () => {
  it('Nolhaga-style present address is present', () => {
    const r = describeInvoiceAddress('Trophi Fastigheter AB\nBox 1\n111 22 Stockholm');
    expect(r.present).toBe(true);
    expect(r.display).toContain('Trophi');
  });

  it('null/empty is explicit ej registrerad', () => {
    expect(describeInvoiceAddress(null).present).toBe(false);
    expect(describeInvoiceAddress('').display).toBe('ej registrerad i systemet');
    expect(describeInvoiceAddress('   ').present).toBe(false);
  });
});

describe('jarvisPolicy – deep links', () => {
  it('maps entities to app routes', () => {
    expect(deepLinkForEntity('work_order', 'abc')).toBe('/work-orders');
    expect(deepLinkForEntity('project', 'p1')).toBe('/projects/p1');
    expect(deepLinkForEntity('property', 'f1')).toBe('/property/f1');
    expect(deepLinkForEntity('component', 'c1')).toBe('/components/c1');
    expect(deepLinkForEntity(null)).toBeNull();
  });
});

describe('jarvisPolicy – briefing + intent', () => {
  it('formats briefing with counts only from input', () => {
    const text = formatBriefingPlainLite(
      {
        orgName: 'TestOrg',
        openWorkOrders: 3,
        overdueWorkOrders: 1,
        openProjects: 2,
        pendingTodos: 0,
        pendingAiActions: 4,
        highRiskComponents: 5,
      },
      '2026-08-11T07:00:00.000Z',
    );
    expect(text).toContain('TestOrg');
    expect(text).toContain('Öppna arbetsordrar: 3');
    expect(text).toContain('förfallna: 1');
    expect(text).toContain('Högrisk-komponenter: 5');
  });

  it('detects explicit Swedish apply intents', () => {
    expect(prefersDirectApply('Skapa en arbetsorder för pumpen')).toBe(true);
    expect(prefersDirectApply('Skicka till mig fakturaadressen')).toBe(true);
    expect(prefersDirectApply('Vilka WO är öppna?')).toBe(false);
  });
});

describe('jarvisPolicy – P2 undo window + batch', () => {
  it('allows undo within 5 minutes', () => {
    const now = Date.now();
    const recent = new Date(now - 60_000).toISOString();
    const old = new Date(now - JARVIS_UNDO_WINDOW_MS - 1_000).toISOString();
    expect(isWithinJarvisUndoWindow(recent, now)).toBe(true);
    expect(isWithinJarvisUndoWindow(old, now)).toBe(false);
  });

  it('clamps batch size to max 10', () => {
    expect(clampBatchSize(100)).toBe(JARVIS_BATCH_MAX);
    expect(clampBatchSize(3)).toBe(3);
    expect(clampBatchSize(0)).toBe(1);
  });

  it('only allowlists batchable apply tools', () => {
    expect(isBatchableApplyTool('apply_create_work_order')).toBe(true);
    expect(isBatchableApplyTool('batch_apply_actions')).toBe(false);
    expect(isBatchableApplyTool('send_to_me')).toBe(false);
    expect(isBatchableApplyTool('undo_last_action')).toBe(false);
  });
});
