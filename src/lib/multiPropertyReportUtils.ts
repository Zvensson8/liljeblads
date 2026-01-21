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
  taskId: string;
  name: string;
  description: string;
  planned: number;
  reported: number;
  status: string;
  completionPercent: number;
}

interface TaskObject {
  id: string;
  object_name: string | null;
  is_reported: boolean;
  component?: {
    name: string;
    type: string;
    registration_number: string | null;
    serial_number: string | null;
  } | null;
}

interface DeviationData {
  propertyName: string;
  quarter: string;
  taskName: string;
  planned: number;
  reported: number;
  deviationPercent: number;
  deviationType: string;
  objects: TaskObject[];
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
          taskId: task.id,
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

async function fetchTaskObjects(taskId: string): Promise<TaskObject[]> {
  const { data, error } = await supabase
    .from("drift_task_components")
    .select(`
      id,
      object_name,
      is_reported,
      component:components (
        name,
        type,
        registration_number,
        serial_number
      )
    `)
    .eq("task_id", taskId);

  if (error) {
    console.error(`Error fetching task objects for task ${taskId}:`, error);
    return [];
  }

  return (data || []).map((obj: any) => ({
    id: obj.id,
    object_name: obj.object_name,
    is_reported: obj.is_reported,
    component: obj.component,
  }));
}

async function calculateDeviations(tasks: TaskData[]): Promise<DeviationData[]> {
  const deviations: DeviationData[] = [];

  for (const task of tasks) {
    // Include ALL deviations where planned != reported
    if (task.planned !== task.reported) {
      const deviation =
        task.planned > 0
          ? Math.abs(task.reported - task.planned) / task.planned
          : task.reported > 0 ? 1 : 0;
      const deviationPercent = Math.round(deviation * 100);

      // Fetch objects for this task
      const objects = await fetchTaskObjects(task.taskId);

      deviations.push({
        propertyName: task.propertyName,
        quarter: task.quarter,
        taskName: task.name,
        planned: task.planned,
        reported: task.reported,
        deviationPercent,
        deviationType:
          task.reported > task.planned
            ? "Överrapporterad"
            : "Underrapporterad",
        objects,
      });
    }
  }

  return deviations.sort((a, b) => b.deviationPercent - a.deviationPercent);
}

function calculatePropertyStatsSync(tasks: TaskData[], propertyName: string) {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "Klar").length;
  const inProgress = tasks.filter((t) => t.status === "Pågår").length;
  const missing = tasks.filter((t) => t.status === "Saknas").length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  // Count tasks with any deviation (planned != reported)
  const deviationCount = tasks.filter((t) => t.planned !== t.reported).length;

  return {
    propertyName,
    total,
    completed,
    inProgress,
    missing,
    completionRate,
    deviationCount,
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

  // Calculate all deviations once
  const allDeviations = await calculateDeviations(allTasks);

  if (format === "excel") {
    await generateExcelReport(
      properties,
      allPropertyTasks,
      allTasks,
      allDeviations,
      reportType,
      year,
      quarters
    );
  } else {
    await generatePdfReport(
      properties,
      allPropertyTasks,
      allTasks,
      allDeviations,
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
  allDeviations: DeviationData[],
  reportType: string,
  year: number,
  quarters: string[]
): Promise<void> {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Combined Summary
  const summaryData = properties.map((property) => {
    const tasks = allPropertyTasks.get(property.id) || [];
    return calculatePropertyStatsSync(tasks, property.name);
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
    ["Fastighet", "Totalt", "Klara", "Pågår", "Saknas", "Completion %", "Avvikelser"],
    ...summaryData.map((s) => [
      s.propertyName,
      s.total,
      s.completed,
      s.inProgress,
      s.missing,
      `${s.completionRate}%`,
      s.deviationCount,
    ]),
    [],
    [
      "TOTALT",
      totalTasks,
      totalCompleted,
      totalInProgress,
      totalMissing,
      `${overallRate}%`,
      allDeviations.length,
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
      const overall = calculatePropertyStatsSync(tasks, property.name);

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

  // Deviation summary sheet with objects
  if (allDeviations.length > 0) {
    const deviationSheetData: any[] = [
      ["Avvikelserapport - Alla avvikelser"],
      [`Totalt antal avvikelser: ${allDeviations.length}`],
      [],
      ["Fastighet", "Kvartal", "Uppgift", "Planerat", "Redovisat", "Avvikelse %", "Typ", "Objekt"],
    ];

    allDeviations.forEach((d) => {
      // Format objects list
      const objectsList = d.objects.length > 0 
        ? d.objects.map(obj => {
            if (obj.component) {
              const regNum = obj.component.registration_number ? ` (${obj.component.registration_number})` : '';
              return `${obj.component.name}${regNum}`;
            }
            return obj.object_name || 'Okänt objekt';
          }).join(', ')
        : 'Inga objekt';

      deviationSheetData.push([
        d.propertyName,
        d.quarter,
        d.taskName,
        d.planned,
        d.reported,
        `${d.deviationPercent}%`,
        d.deviationType,
        objectsList,
      ]);
    });

    const deviationWs = XLSX.utils.aoa_to_sheet(deviationSheetData);
    XLSX.utils.book_append_sheet(wb, deviationWs, "Avvikelser");
  }

  // Detailed sheets per property
  for (const property of properties) {
    const tasks = allPropertyTasks.get(property.id) || [];
    if (tasks.length === 0) continue;

    const propertyDeviations = allDeviations.filter(d => d.propertyName === property.name);
    const taskData: any[] = [
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

    // Add deviation summary for this property with objects
    if (propertyDeviations.length > 0) {
      taskData.push(
        [],
        ["--- AVVIKELSER ---"],
        ["Kvartal", "Uppgift", "Planerat", "Redovisat", "Avvikelse", "Typ", "Objekt"],
        ...propertyDeviations.map((d) => {
          const objectsList = d.objects.length > 0 
            ? d.objects.map(obj => obj.component?.name || obj.object_name || 'Okänt').join(', ')
            : 'Inga objekt';
          return [
            d.quarter,
            d.taskName,
            d.planned,
            d.reported,
            `${d.deviationPercent}%`,
            d.deviationType,
            objectsList,
          ];
        })
      );
    }

    const ws = XLSX.utils.aoa_to_sheet(taskData);
    // Truncate sheet name to 31 chars (Excel limit)
    const sheetName = property.name.substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

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
  allDeviations: DeviationData[],
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
    const stats = calculatePropertyStatsSync(tasks, property.name);
    return [
      stats.propertyName,
      stats.total,
      stats.completed,
      stats.missing,
      `${stats.completionRate}%`,
      stats.deviationCount,
    ];
  });

  // Add totals
  const totalTasks = allTasks.length;
  const totalCompleted = allTasks.filter((t) => t.status === "Klar").length;
  const totalMissing = allTasks.filter((t) => t.status === "Saknas").length;
  const overallRate =
    totalTasks > 0 ? Math.round((totalCompleted / totalTasks) * 100) : 0;

  summaryData.push(["TOTALT", totalTasks, totalCompleted, totalMissing, `${overallRate}%`, allDeviations.length]);

  autoTable(doc, {
    startY: 42,
    head: [["Fastighet", "Totalt", "Klara", "Saknas", "Completion", "Avvikelser"]],
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

  // Deviation summary page with objects
  if (allDeviations.length > 0) {
    doc.addPage();
    doc.setFontSize(14);
    doc.text("Avvikelserapport", 14, 20);
    doc.setFontSize(10);
    doc.text(`Alla avvikelser mellan planerat och redovisat`, 14, 28);
    doc.text(`Totalt antal avvikelser: ${allDeviations.length}`, 14, 34);

    const deviationData = allDeviations.slice(0, 40).map((d) => {
      const objectsCount = d.objects.length;
      const objectsText = objectsCount > 0 
        ? `${objectsCount} obj.`
        : '-';
      return [
        d.propertyName.substring(0, 12),
        d.quarter,
        d.taskName.substring(0, 20),
        d.planned,
        d.reported,
        `${d.deviationPercent}%`,
        d.deviationType.substring(0, 8),
        objectsText,
      ];
    });

    autoTable(doc, {
      startY: 40,
      head: [["Fastighet", "Kv.", "Uppgift", "Plan.", "Red.", "Avv. %", "Typ", "Objekt"]],
      body: deviationData,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [220, 38, 38] },
      columnStyles: {
        0: { cellWidth: 22 },
        2: { cellWidth: 35 },
      },
    });

    if (allDeviations.length > 40) {
      doc.text(
        `... och ${allDeviations.length - 40} fler avvikelser (se Excel för fullständig lista)`,
        14,
        (doc as any).lastAutoTable.finalY + 10
      );
    }
  }

  // Detailed pages per property
  for (const property of properties) {
    const tasks = allPropertyTasks.get(property.id) || [];
    if (tasks.length === 0) continue;

    doc.addPage();
    doc.setFontSize(14);
    doc.text(property.name, 14, 20);

    const stats = calculatePropertyStatsSync(tasks, property.name);
    const propertyDeviations = allDeviations.filter(d => d.propertyName === property.name);
    
    doc.setFontSize(10);
    doc.text(
      `Totalt: ${stats.total} | Klara: ${stats.completed} | Saknas: ${stats.missing} | Completion: ${stats.completionRate}%`,
      14,
      28
    );
    
    if (propertyDeviations.length > 0) {
      doc.setTextColor(220, 38, 38);
      doc.text(`⚠ ${propertyDeviations.length} avvikelse${propertyDeviations.length > 1 ? 'r' : ''}`, 14, 34);
      doc.setTextColor(0, 0, 0);
    }

    const taskData = tasks.map((t) => [
      t.quarter,
      t.name.substring(0, 30),
      t.planned,
      t.reported,
      t.status,
    ]);

    autoTable(doc, {
      startY: propertyDeviations.length > 0 ? 40 : 34,
      head: [["Kvartal", "Uppgift", "Plan.", "Red.", "Status"]],
      body: taskData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
      columnStyles: {
        1: { cellWidth: 60 },
      },
    });

    // Add property-specific deviations with objects
    if (propertyDeviations.length > 0) {
      const yPos = (doc as any).lastAutoTable.finalY + 10;
      
      if (yPos < 240) {
        doc.setFontSize(11);
        doc.text("Avvikelser med objekt:", 14, yPos);

        autoTable(doc, {
          startY: yPos + 5,
          head: [["Kv.", "Uppgift", "Plan.", "Red.", "Avv. %", "Objekt"]],
          body: propertyDeviations.slice(0, 8).map((d) => {
            const objectsList = d.objects.length > 0 
              ? d.objects.slice(0, 2).map(obj => obj.component?.name || obj.object_name || '?').join(', ')
                + (d.objects.length > 2 ? ` +${d.objects.length - 2}` : '')
              : '-';
            return [
              d.quarter,
              d.taskName.substring(0, 20),
              d.planned,
              d.reported,
              `${d.deviationPercent}%`,
              objectsList,
            ];
          }),
          styles: { fontSize: 7 },
          headStyles: { fillColor: [220, 38, 38] },
        });
      }
    }
  }

  // Save
  const filename =
    reportType === "year"
      ? `Driftrapport_Samlad_${year}.pdf`
      : `Driftrapport_Samlad_${quarters[0]}_${year}.pdf`;

  doc.save(filename);
}
