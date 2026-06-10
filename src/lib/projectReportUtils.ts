import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import type { Database } from "@/integrations/supabase/types";
import type { Project } from "@/types/domain";

type ProjectCost = Database["public"]["Tables"]["project_cost_items"]["Row"];
type ProjectChecklistItem = Database["public"]["Tables"]["project_checklist_items"]["Row"];
type ProjectDocument = Database["public"]["Tables"]["project_documents"]["Row"];
type ProjectActivity = Database["public"]["Tables"]["project_activity_log"]["Row"];

/**
 * Project shape the PDF report renders. Callers may join a subset of property
 * columns (name/address), so the relation is intentionally loose.
 */
export type ProjectReportInput = Project & {
  properties?: { name?: string | null; address?: string | null } | null;
};

/** jsPDF with the autoTable plugin's `lastAutoTable` runtime property. */
type JsPdfWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } };

export const generateProjectPDFReport = async (
  project: ProjectReportInput,
  costs: ProjectCost[],
  checklistItems: ProjectChecklistItem[],
  documents: ProjectDocument[],
  // Kept for backwards compatibility; the function does not yet render the log.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _activityLog: ProjectActivity[]
) => {
  const doc = new jsPDF();
  let yPos = 20;

  // Title
  doc.setFontSize(20);
  doc.text("PROJEKTRAPPORT", 105, yPos, { align: "center" });
  yPos += 15;

  doc.setFontSize(16);
  doc.text(project.name, 105, yPos, { align: "center" });
  yPos += 10;

  doc.setFontSize(11);
  if (project.project_number) {
    doc.text(`Projektnummer: ${project.project_number}`, 105, yPos, { align: "center" });
    yPos += 7;
  }
  doc.text(`Rapport skapad: ${format(new Date(), "d MMMM yyyy", { locale: sv })}`, 105, yPos, { align: "center" });
  yPos += 15;

  // Project Overview
  doc.setFontSize(14);
  doc.text("Projektöversikt", 15, yPos);
  yPos += 7;

  const overviewData = [
    ["Projektnummer", project.project_number || "-"],
    ["Typ", getTypeText(project.type)],
    ["Status", getStatusText(project.status)],
    ["Fastighet", project.properties?.name || "-"],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [["Fält", "Värde"]],
    body: overviewData,
    theme: "striped",
    headStyles: { fillColor: [59, 130, 246] },
    margin: { left: 15, right: 15 },
  });

  yPos = (doc as JsPdfWithAutoTable).lastAutoTable.finalY + 10;

  if (project.description) {
    doc.setFontSize(12);
    doc.text("Beskrivning:", 15, yPos);
    yPos += 5;
    doc.setFontSize(10);
    const splitDesc = doc.splitTextToSize(project.description, 180);
    doc.text(splitDesc, 15, yPos);
    yPos += splitDesc.length * 5 + 5;
  }

  // Economic Summary
  doc.addPage();
  yPos = 20;
  doc.setFontSize(14);
  doc.text("Ekonomisk Sammanfattning", 15, yPos);
  yPos += 7;

  const budget = project.budget || 0;
  const forecast = project.forecast || budget;
  const actual = project.actual_cost || 0;
  const variance = actual - budget;
  const variancePercent = budget > 0 ? (variance / budget) * 100 : 0;

  const economyData = [
    ["Budget", `${budget.toLocaleString("sv-SE")} kr`],
    ["Prognos", `${forecast.toLocaleString("sv-SE")} kr`],
    ["Utfall", `${actual.toLocaleString("sv-SE")} kr`],
    ["Avvikelse", `${variance.toLocaleString("sv-SE")} kr (${variancePercent.toFixed(1)}%)`],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [["Kategori", "Belopp"]],
    body: economyData,
    theme: "grid",
    headStyles: { fillColor: [59, 130, 246] },
    margin: { left: 15, right: 15 },
    columnStyles: {
      1: { halign: "right" },
    },
  });

  yPos = (doc as JsPdfWithAutoTable).lastAutoTable.finalY + 10;

  // Cost List
  if (costs.length > 0) {
    doc.setFontSize(12);
    doc.text("Kostnader", 15, yPos);
    yPos += 5;

    const costData = costs.map((cost) => [
      format(new Date(cost.cost_date), "yyyy-MM-dd"),
      cost.description,
      cost.actor || "-",
      `${Number(cost.amount).toLocaleString("sv-SE")} kr`,
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [["Datum", "Beskrivning", "Aktör", "Belopp"]],
      body: costData,
      theme: "striped",
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 15, right: 15 },
      columnStyles: {
        3: { halign: "right" },
      },
      styles: { fontSize: 9 },
    });
  }

  // Checklist
  if (checklistItems.length > 0) {
    doc.addPage();
    yPos = 20;
    doc.setFontSize(14);
    doc.text("Checklista", 15, yPos);
    yPos += 7;

    const completedCount = checklistItems.filter((i) => i.completed).length;
    doc.setFontSize(11);
    doc.text(`${completedCount} av ${checklistItems.length} klara`, 15, yPos);
    yPos += 7;

    const checklistData = checklistItems.map((item) => [
      item.completed ? "✓" : "✗",
      item.title,
      item.responsible || "-",
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [["Status", "Titel", "Ansvarig"]],
      body: checklistData,
      theme: "striped",
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 15, right: 15 },
      styles: { fontSize: 9 },
    });
  }

  // Documents
  if (documents.length > 0) {
    doc.addPage();
    yPos = 20;
    doc.setFontSize(14);
    doc.text("Dokument", 15, yPos);
    yPos += 7;

    const docData = documents.map((d) => [
      d.name,
      d.folder || "Allmänt",
      format(new Date(d.created_at), "yyyy-MM-dd"),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [["Namn", "Mapp", "Datum"]],
      body: docData,
      theme: "striped",
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 15, right: 15 },
      styles: { fontSize: 9 },
    });
  }

  // Save
  const fileName = `Projekt_${project.project_number || project.name}_${format(new Date(), "yyyyMMdd")}.pdf`;
  doc.save(fileName);
};

const getStatusText = (status: string): string => {
  const map: Record<string, string> = {
    planerat: "Planerat",
    invantar_offert: "Inväntar offert",
    offert_finns: "Offert finns",
    pagaende: "Pågående",
    avslutat: "Avslutat",
  };
  return map[status] || status;
};

const getTypeText = (type: string): string => {
  const map: Record<string, string> = {
    investering: "Investering",
    underhall: "Underhåll",
    energi: "Energi",
    annat: "Annat",
  };
  return map[type] || type;
};
