import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import QRCode from "qrcode";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface Project {
  id: string;
  name: string;
  description?: string;
  type: string;
  status: string;
  budget: number;
  forecast?: number;
  actual_cost: number;
  start_date?: string;
  end_date?: string;
  quarter?: string;
  year?: number;
  project_number?: string;
  properties?: {
    name: string;
    address?: string;
  };
}

interface CostItem {
  cost_date: string;
  description: string;
  actor?: string;
  category?: string;
  amount: number;
}

interface ChecklistItem {
  title: string;
  description?: string;
  responsible?: string;
  deadline?: string;
  completed: boolean;
}

interface Document {
  name: string;
  folder?: string;
  created_at: string;
  file_size?: number;
  file_url?: string;
}

interface ActivityLog {
  created_at: string;
  action_type: string;
  details?: string;
  profiles?: {
    full_name?: string;
  };
}

interface ReportOptions {
  includeSections?: {
    overview?: boolean;
    economy?: boolean;
    checklist?: boolean;
    documents?: boolean;
    activity?: boolean;
  };
  dateRange?: {
    from?: Date;
    to?: Date;
  };
  organizationLogo?: string;
  organizationName?: string;
}

export const generateProjectReport = async (
  project: Project,
  costs: CostItem[],
  checklistItems: ChecklistItem[],
  documents: Document[],
  activityLog: ActivityLog[],
  options: ReportOptions = {}
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPosition = 20;

  // Default all sections to true if not specified
  const sections = {
    overview: true,
    economy: true,
    checklist: true,
    documents: true,
    activity: true,
    ...options.includeSections,
  };

  // Helper function to add new page if needed
  const checkPageBreak = (requiredSpace: number) => {
    if (yPosition + requiredSpace > pageHeight - 20) {
      doc.addPage();
      yPosition = 20;
      return true;
    }
    return false;
  };

  // Page 1: Cover Page
  doc.setFillColor(59, 130, 246); // Blue
  doc.rect(0, 0, pageWidth, 80, "F");

  if (options.organizationLogo) {
    try {
      doc.addImage(options.organizationLogo, "PNG", 15, 15, 40, 20);
    } catch (e) {
      console.error("Could not add logo", e);
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.text("PROJEKTRAPPORT", pageWidth / 2, 50, { align: "center" });

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(20);
  yPosition = 100;
  doc.text(project.name, pageWidth / 2, yPosition, { align: "center" });

  yPosition += 15;
  doc.setFontSize(12);
  if (project.project_number) {
    doc.text(`Projektnummer: ${project.project_number}`, pageWidth / 2, yPosition, {
      align: "center",
    });
    yPosition += 8;
  }

  if (project.properties) {
    doc.text(`Fastighet: ${project.properties.name}`, pageWidth / 2, yPosition, {
      align: "center",
    });
    yPosition += 8;
  }

  doc.text(
    `Rapportdatum: ${format(new Date(), "d MMMM yyyy", { locale: sv })}`,
    pageWidth / 2,
    yPosition,
    { align: "center" }
  );

  yPosition += 15;
  doc.setFillColor(200, 200, 200);
  doc.roundedRect(pageWidth / 2 - 30, yPosition, 60, 12, 3, 3, "F");
  doc.setFontSize(11);
  doc.text(getStatusText(project.status), pageWidth / 2, yPosition + 8, {
    align: "center",
  });

  // Page 2: Project Overview
  if (sections.overview) {
    doc.addPage();
    yPosition = 20;

    doc.setFontSize(18);
    doc.setTextColor(59, 130, 246);
    doc.text("Projektöversikt", 15, yPosition);
    yPosition += 15;

    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);

    const overviewData = [
      ["Projektnummer", project.project_number || "-"],
      ["Projektnamn", project.name],
      ["Typ", getTypeText(project.type)],
      ["Status", getStatusText(project.status)],
      ["Fastighet", project.properties?.name || "-"],
      ["Adress", project.properties?.address || "-"],
      [
        "Tidsram",
        project.quarter && project.year
          ? `${project.quarter} ${project.year}`
          : "-",
      ],
      [
        "Startdatum",
        project.start_date
          ? format(new Date(project.start_date), "d MMM yyyy", { locale: sv })
          : "-",
      ],
      [
        "Slutdatum",
        project.end_date
          ? format(new Date(project.end_date), "d MMM yyyy", { locale: sv })
          : "-",
      ],
    ];

    autoTable(doc, {
      startY: yPosition,
      head: [["Fält", "Värde"]],
      body: overviewData,
      theme: "striped",
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 15, right: 15 },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;

    if (project.description) {
      checkPageBreak(40);
      doc.setFontSize(14);
      doc.setTextColor(59, 130, 246);
      doc.text("Beskrivning", 15, yPosition);
      yPosition += 10;

      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      const splitDescription = doc.splitTextToSize(
        project.description,
        pageWidth - 30
      );
      doc.text(splitDescription, 15, yPosition);
      yPosition += splitDescription.length * 5;
    }
  }

  // Page 3-4: Economic Summary
  if (sections.economy) {
    doc.addPage();
    yPosition = 20;

    doc.setFontSize(18);
    doc.setTextColor(59, 130, 246);
    doc.text("Ekonomisk Sammanfattning", 15, yPosition);
    yPosition += 15;

    // Key metrics
    const budget = project.budget || 0;
    const forecast = project.forecast || project.budget || 0;
    const actual = project.actual_cost || 0;
    const variance = actual - budget;
    const variancePercent = budget > 0 ? (variance / budget) * 100 : 0;

    const economyData = [
      ["Budget", `${budget.toLocaleString("sv-SE")} kr`],
      ["Prognos", `${forecast.toLocaleString("sv-SE")} kr`],
      ["Utfall", `${actual.toLocaleString("sv-SE")} kr`],
      [
        "Avvikelse",
        `${variance.toLocaleString("sv-SE")} kr (${variancePercent.toFixed(1)}%)`,
      ],
    ];

    autoTable(doc, {
      startY: yPosition,
      head: [["Kategori", "Belopp"]],
      body: economyData,
      theme: "grid",
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 15, right: 15 },
      columnStyles: {
        1: { halign: "right" },
      },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;

    // Cost breakdown by category
    if (costs.length > 0) {
      checkPageBreak(60);
      doc.setFontSize(14);
      doc.setTextColor(59, 130, 246);
      doc.text("Kostnadsfördelning per kategori", 15, yPosition);
      yPosition += 10;

      const categoryTotals = costs.reduce((acc, cost) => {
        const category = cost.category || "Övrigt";
        acc[category] = (acc[category] || 0) + Number(cost.amount);
        return acc;
      }, {} as Record<string, number>);

      const categoryData = Object.entries(categoryTotals).map(
        ([category, total]) => [category, `${total.toLocaleString("sv-SE")} kr`]
      );

      autoTable(doc, {
        startY: yPosition,
        head: [["Kategori", "Belopp"]],
        body: categoryData,
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246] },
        margin: { left: 15, right: 15 },
        columnStyles: {
          1: { halign: "right" },
        },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 15;

      // Detailed cost list
      doc.addPage();
      yPosition = 20;
      doc.setFontSize(14);
      doc.setTextColor(59, 130, 246);
      doc.text("Detaljerad kostnadslista", 15, yPosition);
      yPosition += 10;

      const costData = costs.map((cost) => [
        format(new Date(cost.cost_date), "yyyy-MM-dd"),
        cost.description,
        cost.actor || "-",
        cost.category || "Övrigt",
        `${Number(cost.amount).toLocaleString("sv-SE")} kr`,
      ]);

      autoTable(doc, {
        startY: yPosition,
        head: [["Datum", "Beskrivning", "Aktör", "Kategori", "Belopp"]],
        body: costData,
        theme: "striped",
        headStyles: { fillColor: [59, 130, 246] },
        margin: { left: 15, right: 15 },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 60 },
          2: { cellWidth: 35 },
          3: { cellWidth: 30 },
          4: { cellWidth: 30, halign: "right" },
        },
        styles: { fontSize: 9 },
      });
    }
  }

  // Page 5: Checklist
  if (sections.checklist && checklistItems.length > 0) {
    doc.addPage();
    yPosition = 20;

    doc.setFontSize(18);
    doc.setTextColor(59, 130, 246);
    doc.text("Checklista", 15, yPosition);
    yPosition += 15;

    // Progress
    const completedCount = checklistItems.filter((item) => item.completed).length;
    const totalCount = checklistItems.length;
    const progressPercent = (completedCount / totalCount) * 100;

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(
      `Framsteg: ${completedCount} av ${totalCount} klara (${progressPercent.toFixed(0)}%)`,
      15,
      yPosition
    );
    yPosition += 10;

    // Progress bar
    doc.setFillColor(220, 220, 220);
    doc.rect(15, yPosition, pageWidth - 30, 8, "F");
    doc.setFillColor(34, 197, 94); // Green
    doc.rect(15, yPosition, ((pageWidth - 30) * progressPercent) / 100, 8, "F");
    yPosition += 15;

    // Checklist table
    const checklistData = checklistItems.map((item) => [
      item.completed ? "✓" : "✗",
      item.title,
      item.responsible || "-",
      item.deadline
        ? format(new Date(item.deadline), "yyyy-MM-dd")
        : "-",
      item.description || "-",
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [["Status", "Titel", "Ansvarig", "Deadline", "Beskrivning"]],
      body: checklistData,
      theme: "striped",
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 15, right: 15 },
      columnStyles: {
        0: { cellWidth: 15, halign: "center" },
        1: { cellWidth: 50 },
        2: { cellWidth: 35 },
        3: { cellWidth: 25 },
        4: { cellWidth: 55 },
      },
      styles: { fontSize: 9 },
    });
  }

  // Page 6: Documents
  if (sections.documents && documents.length > 0) {
    doc.addPage();
    yPosition = 20;

    doc.setFontSize(18);
    doc.setTextColor(59, 130, 246);
    doc.text("Dokument & Bilder", 15, yPosition);
    yPosition += 15;

    const documentData = documents.map((doc) => [
      doc.name,
      doc.folder || "Allmänt",
      format(new Date(doc.created_at), "yyyy-MM-dd HH:mm"),
      doc.file_size ? `${(doc.file_size / 1024).toFixed(0)} KB` : "-",
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [["Namn", "Mapp", "Uppladdad", "Storlek"]],
      body: documentData,
      theme: "striped",
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 15, right: 15 },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 40 },
        2: { cellWidth: 40 },
        3: { cellWidth: 30, halign: "right" },
      },
      styles: { fontSize: 9 },
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;

    // QR Code for digital access
    try {
      const projectUrl = `${window.location.origin}/projects/${project.id}`;
      const qrCodeDataUrl = await QRCode.toDataURL(projectUrl, {
        width: 100,
        margin: 1,
      });
      
      checkPageBreak(50);
      doc.setFontSize(12);
      doc.text("Scanna för digital åtkomst till dokumenten:", 15, yPosition);
      yPosition += 10;
      doc.addImage(qrCodeDataUrl, "PNG", 15, yPosition, 40, 40);
    } catch (e) {
      console.error("Could not generate QR code", e);
    }
  }

  // Page 7: Activity Log
  if (sections.activity && activityLog.length > 0) {
    doc.addPage();
    yPosition = 20;

    doc.setFontSize(18);
    doc.setTextColor(59, 130, 246);
    doc.text("Aktivitetslogg", 15, yPosition);
    yPosition += 15;

    const activityData = activityLog.slice(0, 50).map((log) => [
      format(new Date(log.created_at), "yyyy-MM-dd HH:mm"),
      getActivityTypeText(log.action_type),
      log.details || "-",
      log.profiles?.full_name || "System",
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [["Datum & Tid", "Typ", "Beskrivning", "Användare"]],
      body: activityData,
      theme: "striped",
      headStyles: { fillColor: [59, 130, 246] },
      margin: { left: 15, right: 15 },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 35 },
        2: { cellWidth: 75 },
        3: { cellWidth: 35 },
      },
      styles: { fontSize: 9 },
    });
  }

  // Final page: Summary
  doc.addPage();
  yPosition = 20;

  doc.setFontSize(18);
  doc.setTextColor(59, 130, 246);
  doc.text("Sammanfattning", 15, yPosition);
  yPosition += 15;

  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);

  const completedChecklist = checklistItems.filter((i) => i.completed).length;
  const totalCost = project.actual_cost || 0;
  const budgetUsed = project.budget > 0 ? (totalCost / project.budget) * 100 : 0;

  const summaryText = [
    `• Checklista: ${completedChecklist} av ${checklistItems.length} punkter klara`,
    `• Ekonomi: ${totalCost.toLocaleString("sv-SE")} kr använt av ${project.budget.toLocaleString("sv-SE")} kr budget`,
    `• Budgetanvändning: ${budgetUsed.toFixed(1)}%`,
    `• Status: ${getStatusText(project.status)}`,
    `• Dokument: ${documents.length} st`,
  ];

  summaryText.forEach((line) => {
    doc.text(line, 15, yPosition);
    yPosition += 8;
  });

  yPosition += 10;
  doc.setFontSize(9);
  doc.setTextColor(128, 128, 128);
  doc.text(
    `Rapport genererad: ${format(new Date(), "d MMMM yyyy 'kl' HH:mm", {
      locale: sv,
    })}`,
    15,
    yPosition
  );
  if (options.organizationName) {
    yPosition += 5;
    doc.text(`Organisation: ${options.organizationName}`, 15, yPosition);
  }

  // Save the PDF
  const fileName = `Projekt_${project.project_number || project.name}_${format(
    new Date(),
    "yyyyMMdd"
  )}.pdf`;
  doc.save(fileName);
};

const getStatusText = (status: string): string => {
  const statusMap: Record<string, string> = {
    planerat: "Planerat",
    invantar_offert: "Inväntar offert",
    offert_finns: "Offert finns",
    pagaende: "Pågående",
    avslutat: "Avslutat",
  };
  return statusMap[status] || status;
};

const getTypeText = (type: string): string => {
  const typeMap: Record<string, string> = {
    investering: "Investering",
    underhall: "Underhåll",
    energi: "Energi",
    annat: "Annat",
  };
  return typeMap[type] || type;
};

const getActivityTypeText = (actionType: string): string => {
  const actionMap: Record<string, string> = {
    created: "Skapad",
    updated: "Uppdaterad",
    status_changed: "Status ändrad",
    cost_added: "Kostnad tillagd",
    document_added: "Dokument tillagt",
    checklist_updated: "Checklista uppdaterad",
  };
  return actionMap[actionType] || actionType;
};
