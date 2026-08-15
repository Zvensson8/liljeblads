import type { PlanItemDraft } from '@/lib/maintenancePlanEngine';

export type ExistingPlanItem = {
  id: string;
  component_id: string | null;
  source: string;
  status: string;
  user_edited?: boolean | null;
};

export type WeibullMergeDecision =
  | { kind: 'insert'; draft: PlanItemDraft }
  | { kind: 'update'; id: string; draft: PlanItemDraft }
  | { kind: 'skip'; reason: 'edited' | 'skipped' | 'not-weibull' | 'no-component' };

/**
 * Merge engine drafts into an existing plan without touching human work.
 * Skipped / edited / non-planned Weibull rows stay as they are.
 */
export function planWeibullMerge(
  existing: ExistingPlanItem[],
  drafts: PlanItemDraft[],
): WeibullMergeDecision[] {
  const byWeibull = new Map<string, ExistingPlanItem>();
  const occupied = new Set<string>();
  const skippedComponents = new Set<string>();

  for (const row of existing) {
    if (!row.component_id) continue;
    if (row.status === 'skipped') {
      skippedComponents.add(row.component_id);
      continue;
    }
    occupied.add(row.component_id);
    if (row.source === 'weibull') {
      byWeibull.set(row.component_id, row);
    }
  }

  return drafts.map((draft) => {
    const cid = draft.componentId;
    if (!cid) return { kind: 'skip', reason: 'no-component' };
    if (skippedComponents.has(cid)) return { kind: 'skip', reason: 'skipped' };

    const row = byWeibull.get(cid);
    if (!row) {
      if (occupied.has(cid)) return { kind: 'skip', reason: 'not-weibull' };
      return { kind: 'insert', draft };
    }
    if (row.user_edited || row.status !== 'planned') {
      return { kind: 'skip', reason: 'edited' };
    }
    return { kind: 'update', id: row.id, draft };
  });
}
