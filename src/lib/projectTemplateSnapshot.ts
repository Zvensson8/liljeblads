/**
 * Snapshot of a live project as an org template.
 * No instance data (property, people, dates, actual invoices).
 * Ready for “Spara som mall” later — not wired in the UI yet.
 */

export const PROJECT_TEMPLATE_TYPES = [
  'investering',
  'underhall',
  'energi',
  'annat',
] as const;

export type ProjectTemplateType = (typeof PROJECT_TEMPLATE_TYPES)[number];

export interface ProjectTemplateChecklistItem {
  title: string;
  description: string;
  deadline_offset_days: number | null;
}

export interface ProjectTemplateBudgetCategory {
  name: string;
  estimated_amount: number;
}

export interface ProjectTemplateSnapshot {
  name: string;
  description: string | null;
  type: ProjectTemplateType;
  default_budget: number | null;
  estimated_duration_quarters: number | null;
  checklist_items: ProjectTemplateChecklistItem[];
  budget_categories: ProjectTemplateBudgetCategory[];
}

export interface ProjectForTemplateSnapshot {
  name?: string | null;
  description?: string | null;
  type?: string | null;
  budget?: number | null;
  start_quarter?: number | null;
  end_quarter?: number | null;
  year?: number | null;
}

export interface ChecklistRowForSnapshot {
  title: string;
  description?: string | null;
  order_index?: number | null;
}

export interface CostRowForSnapshot {
  category?: string | null;
  amount?: number | null;
}

export function mapProjectTypeToTemplateType(type: string | null | undefined): ProjectTemplateType {
  const t = (type ?? '').trim().toLowerCase();
  if (t === 'investering' || t === 'underhall' || t === 'energi' || t === 'annat') {
    return t;
  }
  if (t === 'underhåll' || t === 'maintenance') return 'underhall';
  if (t === 'investment') return 'investering';
  if (t === 'energy') return 'energi';
  return 'annat';
}

export function durationQuartersFromProject(
  project: ProjectForTemplateSnapshot,
): number | null {
  const start = project.start_quarter;
  const end = project.end_quarter;
  if (start != null && end != null && start >= 1 && end >= 1) {
    const span = end - start + 1;
    return span > 0 ? span : null;
  }
  return null;
}

export function snapshotProjectAsTemplate(
  project: ProjectForTemplateSnapshot,
  checklist: ChecklistRowForSnapshot[],
  costs: CostRowForSnapshot[],
): ProjectTemplateSnapshot {
  const checklist_items = [...checklist]
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((item) => ({
      title: item.title.trim(),
      description: (item.description ?? '').trim(),
      deadline_offset_days: null as number | null,
    }))
    .filter((item) => item.title.length > 0);

  const byCategory = new Map<string, number>();
  for (const row of costs) {
    const name = (row.category ?? '').trim() || 'Övrigt';
    const amount = Number(row.amount) || 0;
    byCategory.set(name, (byCategory.get(name) ?? 0) + amount);
  }
  const budget_categories = [...byCategory.entries()].map(([name, estimated_amount]) => ({
    name,
    estimated_amount,
  }));

  return {
    name: (project.name ?? '').trim() || 'Projektmall',
    description: project.description?.trim() || null,
    type: mapProjectTypeToTemplateType(project.type),
    default_budget: project.budget ?? null,
    estimated_duration_quarters: durationQuartersFromProject(project),
    checklist_items,
    budget_categories,
  };
}
