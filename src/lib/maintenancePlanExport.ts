import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { createWorkbook, addJsonSheet, downloadWorkbook } from './excelUtils';
import {
  actionTypeLabel,
  computePlanPeriod,
  formatPlanPeriod,
  type PlanActionType,
  type Quarter,
} from './maintenancePlanEngine';
import { riskLevelLabel, type RiskLevel } from './componentRisk';

type JsPdfWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };

export interface MaintenancePlanExportRow {
  propertyName: string;
  componentName: string;
  componentType: string | null;
  year: number;
  quarter: number;
  actionType: string;
  title: string;
  riskLevel: string;
  riskScore: number;
  estimatedCost: number | null;
  remainingB10Years: number | null;
}

export interface MaintenancePlanExportMeta {
  title?: string;
  startYear: number;
  startQuarter: Quarter;
  horizonYears: number;
  propertyCount: number;
  totalCost: number;
  itemCount: number;
}

function formatSek(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.round(n).toLocaleString('sv-SE')} kr`;
}

/** Human-readable plan window + portfolio size for exports. */
export function buildExportPeriod(meta: MaintenancePlanExportMeta): string {
  const period = computePlanPeriod(meta.startYear, meta.startQuarter, meta.horizonYears);
  return `${formatPlanPeriod(period)} · ${meta.propertyCount} fastigheter`;
}

export async function exportMaintenancePlanToExcel(
  rows: MaintenancePlanExportRow[],
  meta: MaintenancePlanExportMeta,
  filename?: string,
): Promise<void> {
  const wb = createWorkbook();
  const stamp = format(new Date(), 'yyyy-MM-dd');
  const name =
    filename ??
    `Underhallsplan_multi_${meta.startYear}_Q${meta.startQuarter}_${stamp}.xlsx`;

  const summary = [
    {
      'Rapport': meta.title ?? 'Underhållsplan (flera fastigheter)',
      'Period': buildExportPeriod(meta),
      'Fastigheter': meta.propertyCount,
      'Poster': meta.itemCount,
      'Estimerad kostnad': Math.round(meta.totalCost),
      'Genererad': format(new Date(), 'PPP', { locale: sv }),
    },
  ];
  addJsonSheet(wb, 'Sammanfattning', summary);

  const byProperty = new Map<string, { items: number; cost: number }>();
  for (const r of rows) {
    const cur = byProperty.get(r.propertyName) ?? { items: 0, cost: 0 };
    cur.items += 1;
    cur.cost += r.estimatedCost ?? 0;
    byProperty.set(r.propertyName, cur);
  }
  addJsonSheet(
    wb,
    'Per fastighet',
    Array.from(byProperty.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'sv'))
      .map(([property, v]) => ({
        Fastighet: property,
        Poster: v.items,
        'Estimerad kostnad (kr)': Math.round(v.cost),
      })),
  );

  addJsonSheet(
    wb,
    'Planposter',
    rows.map((r) => ({
      Fastighet: r.propertyName,
      Komponent: r.componentName,
      Typ: r.componentType || '—',
      År: r.year,
      Kvartal: `Q${r.quarter}`,
      Åtgärd: actionTypeLabel(r.actionType as PlanActionType),
      Titel: r.title,
      Risk: riskLevelLabel(r.riskLevel as RiskLevel),
      'Riskpoäng': Math.round(r.riskScore),
      'Kostnad (kr)': r.estimatedCost != null ? Math.round(r.estimatedCost) : '—',
      'B10 (år)':
        r.remainingB10Years != null ? Number(r.remainingB10Years).toFixed(1) : '—',
    })),
  );

  await downloadWorkbook(wb, name);
}

export function exportMaintenancePlanToPDF(
  rows: MaintenancePlanExportRow[],
  meta: MaintenancePlanExportMeta,
  filename?: string,
): void {
  const doc = new jsPDF({ orientation: 'landscape' });
  const stamp = format(new Date(), 'yyyy-MM-dd');
  const name =
    filename ??
    `Underhallsplan_multi_${meta.startYear}_Q${meta.startQuarter}_${stamp}.pdf`;

  doc.setFontSize(16);
  doc.text(meta.title ?? 'Underhållsplan — flera fastigheter', 14, 16);
  doc.setFontSize(10);
  doc.text(buildExportPeriod(meta), 14, 24);
  doc.text(
    `Poster: ${meta.itemCount} · Estimerad kostnad: ${formatSek(meta.totalCost)} · ${format(new Date(), 'PPP', { locale: sv })}`,
    14,
    30,
  );

  const tableRows = rows.map((r) => [
    r.propertyName,
    r.componentName,
    `Q${r.quarter} ${r.year}`,
    actionTypeLabel(r.actionType as PlanActionType),
    riskLevelLabel(r.riskLevel as RiskLevel),
    r.estimatedCost != null ? Math.round(r.estimatedCost).toLocaleString('sv-SE') : '—',
  ]);

  autoTable(doc, {
    startY: 36,
    head: [['Fastighet', 'Komponent', 'Period', 'Åtgärd', 'Risk', 'Kostnad (kr)']],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246], fontSize: 8 },
    styles: { fontSize: 7, cellPadding: 1.5 },
    columnStyles: {
      0: { cellWidth: 40 },
      1: { cellWidth: 45 },
      2: { cellWidth: 28 },
      3: { cellWidth: 28 },
      4: { cellWidth: 24 },
      5: { cellWidth: 28, halign: 'right' },
    },
  });

  const finalY = (doc as JsPdfWithAutoTable).lastAutoTable?.finalY ?? 40;
  doc.setFontSize(9);
  doc.text(
    `Totalt ${meta.itemCount} poster · ${formatSek(meta.totalCost)} · ${meta.propertyCount} fastigheter`,
    14,
    finalY + 10,
  );

  doc.save(name);
}
