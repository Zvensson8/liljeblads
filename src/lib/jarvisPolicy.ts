/**
 * Pure Jarvis policy helpers (shared contract for UI + unit evals).
 * Edge functions re-implement the same rules; tests lock the product contract.
 */

/** Fields models must never set for outbound email (self-only send_to_me). */
export const FORBIDDEN_EMAIL_RECIPIENT_FIELDS = [
  'to',
  'recipient',
  'recipient_email',
  'email',
  'cc',
  'bcc',
] as const;

export function findBlockedEmailRecipientField(
  args: Record<string, unknown>,
): string | null {
  for (const field of FORBIDDEN_EMAIL_RECIPIENT_FIELDS) {
    if (args[field] != null && String(args[field]).trim()) {
      return field;
    }
  }
  return null;
}

/** Grounding: describe invoice_address presence from tool payload. */
export function describeInvoiceAddress(
  invoice_address: string | null | undefined,
): { present: boolean; display: string } {
  const trimmed = (invoice_address ?? '').trim();
  if (!trimmed) {
    return { present: false, display: 'ej registrerad i systemet' };
  }
  return { present: true, display: trimmed };
}

export type BriefingLike = {
  orgName: string;
  openWorkOrders: number;
  overdueWorkOrders: number;
  openProjects: number;
  pendingTodos: number;
  pendingAiActions: number;
  highRiskComponents: number;
};

export function formatBriefingPlainLite(stats: BriefingLike, generatedAtIso: string): string {
  return [
    `Jarvis daglig briefing – ${stats.orgName}`,
    `Genererad: ${generatedAtIso.slice(0, 16).replace('T', ' ')} UTC`,
    ``,
    `📊 NYCKELTAL`,
    `• Öppna arbetsordrar: ${stats.openWorkOrders} (förfallna: ${stats.overdueWorkOrders})`,
    `• Aktiva projekt: ${stats.openProjects}`,
    `• Öppna todos: ${stats.pendingTodos}`,
    `• Väntande AI-förslag: ${stats.pendingAiActions}`,
    `• Högrisk-komponenter: ${stats.highRiskComponents}`,
  ].join('\n');
}

/** Deep-link paths returned after apply_* (chat confirmation cards). */
export function deepLinkForEntity(
  entityType: string | null | undefined,
  entityId?: string | null,
): string | null {
  if (entityType === 'work_order') return '/work-orders';
  if (entityType === 'project' && entityId) return `/projects/${entityId}`;
  if (entityType === 'property' && entityId) return `/property/${entityId}`;
  if (entityType === 'component' && entityId) return `/components/${entityId}`;
  return null;
}

/** Explicit vs proactive tool mode from user intent keywords (Swedish). */
export function prefersDirectApply(userMessage: string): boolean {
  const m = userMessage.toLowerCase();
  return /\b(skapa|lägg till|uppdatera|ändra|sätt|logga|skicka till mig|mejl[a]? mig|spara|registrera)\b/.test(
    m,
  );
}

/** P2: undo window (must match edge jarvisUndo.UNDO_WINDOW_MS). */
export const JARVIS_UNDO_WINDOW_MS = 5 * 60 * 1000;

export function isWithinJarvisUndoWindow(
  createdAtIso: string,
  nowMs = Date.now(),
): boolean {
  const t = new Date(createdAtIso).getTime();
  if (Number.isNaN(t)) return false;
  return nowMs - t <= JARVIS_UNDO_WINDOW_MS;
}

export function jarvisUndoDeadline(createdAtIso: string): string {
  return new Date(
    new Date(createdAtIso).getTime() + JARVIS_UNDO_WINDOW_MS,
  ).toISOString();
}

/** P2: max actions per batch_apply call. */
export const JARVIS_BATCH_MAX = 10;

export function clampBatchSize(n: number, max = JARVIS_BATCH_MAX): number {
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), max);
}

/** Tools allowed inside batch_apply (no nested batch/undo recursion). */
export const BATCHABLE_APPLY_TOOLS = [
  'apply_create_work_order',
  'apply_create_project',
  'apply_property_note',
  'apply_create_todo',
  'apply_complete_todo',
  'apply_create_component',
  'apply_log_service',
  'apply_create_contact',
  'apply_work_order_status',
  'apply_project_status',
  'apply_update_invoice_address',
  'apply_update_property',
  'apply_update_component',
  'apply_update_contact',
  'apply_add_project_cost',
  'apply_add_budget_item',
  'apply_complete_checklist_item',
] as const;

/** C: rate limit contract (edge re-implements with api_rate_limits). */
export const JARVIS_RATE_LIMITS = {
  applyPerMinute: 30,
  sendToMePerHour: 10,
} as const;

export function isApplyRateLimited(countInWindow: number): boolean {
  return countInWindow >= JARVIS_RATE_LIMITS.applyPerMinute;
}

export function isSendToMeRateLimited(countInWindow: number): boolean {
  return countInWindow >= JARVIS_RATE_LIMITS.sendToMePerHour;
}

export function isBatchableApplyTool(tool: string): boolean {
  return (BATCHABLE_APPLY_TOOLS as readonly string[]).includes(tool);
}
