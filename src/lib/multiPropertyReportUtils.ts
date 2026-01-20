import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";

interface Property {
  id: string;
  name: string;
}

interface ReportOptions {
  properties: Property[];
  reportType: string;
  year: number;
  quarter: string;
  format: "excel" | "pdf";
}

interface TaskData {
  propertyId: string;
  propertyName: string;
  quarter: string;
  category: string;
  name: string;
  description: string;
  planned: number;
  reported: number;
  status: string;
  completionPercent: number;
}

async function fetchTasksForProperty(
  propertyId: string,
  year: number,
  quarters: string[]
): Promise<TaskData[]> {
  const allTasks: TaskData[] = [];

  for (const quarter of quarters) {
    const { data, error } = await supabase
      .from("drift_tasks")
      .select(
        `
        id,
        name,
        description,
        planned_count,
        reported_count,
        quarter,
        drift_categories (name)
      `
      )
      .eq("property_id", propertyId)
      .eq("year", year)
      .eq("quarter", quarter as "Q1" | "Q2" | "Q3" | "Q4")
      .order("name");

    if (error) {
      console.error(`Error fetching tasks for property ${propertyId}:`, error);
      continue;
    }

    if (data) {
      const { data: propData } = await supabase
        .from("properties")
        .select("name")
        .eq("id", propertyId)
        .single();

      allTasks.push(
        ...data.map((task: any) => ({
          propertyId,
          propertyName: propData?.name || "Okänd",
          quarter,
          category: task.drift_categories?.name || "Ingen",
          name: task.name,
          description: task.description || "",
          planned: task.planned_count,
          reported: task.reported_count,
          status:
            task.reported_count === 0
              ? "Saknas"
              : task.reported_count >= task.planned_count
              ? "Klar"
              : "Pågår",
          completionPercent:
            task.planned_count > 0
              ? Math.round((task.reported_count / task.planned_count) * 100)
              : 0,
        }))
      );
    }
  }

  return allTasks;
}

function calculatePropertyStats(tasks: TaskData[], propertyName: string) {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "Klar").length;
  const inProgress = tasks.filter((t) => t.status === "Pågår").length;
  const missing = tasks.filter((t) => t.status === "Saknas").length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    propertyName,
    total,
    completed,
    inProgress,
    missing,
    completionRate,
  };
}

function calculateQuarterStats(tasks: TaskData[], quarter: string) {
  const quarterTasks = tasks.filter((t) => t.quarter === quarter);
  const total = quarterTasks.length;
  const completed = quarterTasks.filter((t) => t.status === "Klar").length;
  const inProgress = quarterTasks.filter((t) => t.status === "Pågår").length;
  const missing = quarterTasks.filter((t) => t.status === "Saknas").length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    quarter,
    total,
    completed,
    inProgress,
    missing,
    completionRate,
  };
}

export async function generateMultiPropertyReport(
  options: ReportOptions
): Promise<void> {
  const { properties, reportType, year, quarter, format } = options;

  const quarters =
    reportType === "year" ? ["Q1", "Q2", "Q3", "Q4"] : [quarter];

  // Fetch all task data for all properties
  const allPropertyTasks: Map<string, TaskData[]> = new Map();

  for (const property of properties) {
    const tasks = await fetchTasksForProperty(property.id, year, quarters);
    allPropertyTasks.set(property.id, tasks);
  }

  // Flatten all tasks for combined summary
  const allTasks: TaskData[] = [];
  allPropertyTasks.forEach((tasks) => allTasks.push(...tasks));

  if (allTasks.length === 0) {
    throw new Error("Inga uppgifter hittades för de valda fastigheterna");
  }

  if (format === "excel") {
    await generateExcelReport(
      properties,
      allPropertyTasks,
      allTasks,
      reportType,
      year,
      quarters
    );
  } else {
    await generatePdfReport(
      properties,
      allPropertyTasks,
      allTasks,
      reportType,
      year,
      quarters
    );
  }
}

async function generateExcelReport(
  properties: Property[],
  allPropertyTasks: Map<string, TaskData[]>,
  allTasks: TaskData[],
  reportType: string,
  year: number,
  quarters: string[]
): Promise<void> {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Combined Summary
  const summaryData = properties.map((property) => {
    const tasks = allPropertyTasks.get(property.id) || [];
    return calculatePropertyStats(tasks, property.name);
  });

  // Add totals row
  const totalTasks = allTasks.length;
  const totalCompleted = allTasks.filter((t) => t.status === "Klar").length;
  const totalInProgress = allTasks.filter((t) => t.status === "Pågår").length;
  const totalMissing = allTasks.filter((t) => t.status === "Saknas").length;
  const overallRate =
    totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

  const summarySheetData = [
    [
      reportType === "year"
        ? `Samlad årsrapport ${year}`
        : `Samlad kvartalsrapport ${quarters[0]} ${year}`,
    ],
    [`Genererad: ${new Date().toLocaleDateString("sv-SE")}`],
    [`Antal fastigheter: ${properties.length}`],
    [],
    ["Fastighet", "Totalt", "Klara", "Pågår", "Saknas", "Completion %"],
    ...summaryData.map((s) => [
      s.propertyName,
      s.total,
      s.completed,
      s.inProgress,
      s.missing,
      `${s.completionRate}%`,
    ]),
    [],
    [
      "TOTALT",
      totalTasks,
      totalCompleted,
      totalInProgress,
      totalMissing,
      `${overallRate}%`,
    ],
  ];

  const summaryWs = XLSX.utils.aoa_to_sheet(summarySheetData);
  XLSX.utils.book_append_sheet(wb, summaryWs, "Samlad översikt");

  // Sheet 2: Quarter breakdown (for year report)
  if (reportType === "year") {
    const quarterBreakdownData: any[] = [
      ["Kvartalsöversikt per fastighet"],
      [],
      ["Fastighet", "Q1 %", "Q2 %", "Q3 %", "Q4 %", "Totalt %"],
    ];

    properties.forEach((property) => {
      const tasks = allPropertyTasks.get(property.id) || [];
      const q1 = calculateQuarterStats(tasks, "Q1");
      const q2 = calculateQuarterStats(tasks, "Q2");
      const q3 = calculateQuarterStats(tasks, "Q3");
      const q4 = calculateQuarterStats(tasks, "Q4");
      const overall = calculatePropertyStats(tasks, property.name);

      quarterBreakdownData.push([
        property.name,
        `${q1.completionRate}%`,
        `${q2.completionRate}%`,
        `${q3.completionRate}%`,
        `${q4.completionRate}%`,
        `${overall.completionRate}%`,
      ]);
    });

    const quarterWs = XLSX.utils.aoa_to_sheet(quarterBreakdownData);
    XLSX.utils.book_append_sheet(wb, quarterWs, "Kvartalsöversikt");
  }

  // Detailed sheets per property
  properties.forEach((property) => {
    const tasks = allPropertyTasks.get(property.id) || [];
    if (tasks.length === 0) return;

    const taskData = [
      ["Kvartal", "Kategori", "Uppgift", "Planerat", "Redovisat", "Status", "%"],
      ...tasks.map((t) => [
        t.quarter,
        t.category,
        t.name,
        t.planned,
        t.reported,
        t.status,
        `${t.completionPercent}%`,
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(taskData);
    // Truncate sheet name to 31 chars (Excel limit)
    const sheetName = property.name.substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  // Generate filename
  const filename =
    reportType === "year"
      ? `Driftrapport_Samlad_${year}_${new Date().toISOString().split("T")[0]}.xlsx`
      : `Driftrapport_Samlad_${quarters[0]}_${year}_${new Date().toISOString().split("T")[0]}.xlsx`;

  XLSX.writeFile(wb, filename);
}

async function generatePdfReport(
  properties: Property[],
  allPropertyTasks: Map<string, TaskData[]>,
  allTasks: TaskData[],
  reportType: string,
  year: number,
  quarters: string[]
): Promise<void> {
  const doc = new jsPDF();

  // Title
  doc.setFontSize(18);
  doc.text(
    reportType === "year"
      ? `Samlad årsrapport ${year}`
      : `Samlad kvartalsrapport ${quarters[0]} ${year}`,
    14,
    20
  );

  doc.setFontSize(12);
  doc.text(`Genererad: ${new Date().toLocaleDateString("sv-SE")}`, 14, 28);
  doc.text(`Antal fastigheter: ${properties.length}`, 14, 34);

  // Summary table
  const summaryData = properties.map((property) => {
    const tasks = allPropertyTasks.get(property.id) || [];
    const stats = calculatePropertyStats(tasks, property.name);
    return [
      stats.propertyName,
      stats.total,
      stats.completed,
      stats.missing,
      `${stats.completionRate}%`,
    ];
  });

  // Add totals
  const totalTasks = allTasks.length;
  const totalCompleted = allTasks.filter((t) => t.status === "Klar").length;
  const totalMissing = allTasks.filter((t) => t.status === "Saknas").length;
  const overallRate =
    totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

  summaryData.push(["TOTALT", totalTasks, totalCompleted, totalMissing, `${overallRate}%`]);

  autoTable(doc, {
    startY: 42,
    head: [["Fastighet", "Totalt", "Klara", "Saknas", "Completion"]],
    body: summaryData,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [59, 130, 246] },
    footStyles: { fontStyle: "bold" },
  });

  // Quarter breakdown for year report
  if (reportType === "year") {
    doc.addPage();
    doc.setFontSize(14);
    doc.text("Kvartalsöversikt per fastighet", 14, 20);

    const quarterData = properties.map((property) => {
      const tasks = allPropertyTasks.get(property.id) || [];
      const q1 = calculateQuarterStats(tasks, "Q1");
      const q2 = calculateQuarterStats(tasks, "Q2");
      const q3 = calculateQuarterStats(tasks, "Q3");
      const q4 = calculateQuarterStats(tasks, "Q4");

      return [
        property.name,
        `${q1.completionRate}%`,
        `${q2.completionRate}%`,
        `${q3.completionRate}%`,
        `${q4.completionRate}%`,
      ];
    });

    autoTable(doc, {
      startY: 28,
      head: [["Fastighet", "Q1", "Q2", "Q3", "Q4"]],
      body: quarterData,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [59, 130, 246] },
    });
  }

  // Detailed pages per property
  properties.forEach((property) => {
    const tasks = allPropertyTasks.get(property.id) || [];
    if (tasks.length === 0) return;

    doc.addPage();
    doc.setFontSize(14);
    doc.text(property.name, 14, 20);

    const stats = calculatePropertyStats(tasks, property.name);
    doc.setFontSize(10);
    doc.text(
      `Totalt: ${stats.total} | Klara: ${stats.completed} | Saknas: ${stats.missing} | Completion: ${stats.completionRate}%`,
      14,
      28
    );

    const taskData = tasks.map((t) => [
      t.quarter,
      t.name.substring(0, 30),
      t.planned,
      t.reported,
      t.status,
    ]);

    autoTable(doc, {
      startY: 34,
      head: [["Kvartal", "Uppgift", "Plan.", "Red.", "Status"]],
      body: taskData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
      columnStyles: {
        1: { cellWidth: 60 },
      },
    });
  });

  // Save
  const filename =
    reportType === "year"
      ? `Driftrapport_Samlad_${year}.pdf`
      : `Driftrapport_Samlad_${quarters[0]}_${year}.pdf`;

  doc.save(filename);
}
