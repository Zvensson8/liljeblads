import { supabase } from "@/integrations/supabase/client";
import { createWorkbook, addAoASheet, downloadWorkbook } from "./excelUtils";

interface ExportTask {
  name: string;
  description: string | null;
  planned_count: number;
  reported_count: number;
  status: string;
  objects: {
    name: string;
    series_id: string | null;
    registration_number: string | null;
    is_reported: boolean;
  }[];
}

export async function exportQuarterToExcel(
  propertyId: string,
  propertyName: string,
  year: number,
  quarter: "Q1" | "Q2" | "Q3" | "Q4"
) {
  // Fetch tasks
  const { data: tasks } = await supabase
    .from("drift_tasks")
    .select("*")
    .eq("property_id", propertyId)
    .eq("year", year)
    .eq("quarter", quarter as any)
    .order("name");

  if (!tasks || tasks.length === 0) {
    throw new Error("Inga uppgifter att exportera");
  }

  // Fetch objects for each task
  const tasksWithObjects: ExportTask[] = await Promise.all(
    tasks.map(async (task) => {
      const { data: objects } = await supabase
        .from("drift_task_components")
        .select(`
          object_name,
          series_id,
          registration_number,
          is_reported,
          component:components(name)
        `)
        .eq("task_id", task.id);

      const status =
        task.reported_count === 0
          ? "Saknas"
          : task.reported_count >= task.planned_count
          ? "Klar"
          : "Kvar";

      return {
        name: task.name,
        description: task.description,
        planned_count: task.planned_count,
        reported_count: task.reported_count,
        status,
        objects:
          objects?.map((obj: any) => ({
            name: obj.component?.name || obj.object_name || "",
            series_id: obj.series_id,
            registration_number: obj.registration_number,
            is_reported: obj.is_reported,
          })) || [],
      };
    })
  );

  // Create workbook
  const wb = createWorkbook();

  // Summary sheet
  const summaryData = [
    ["Driftuppföljning - Export"],
    ["Fastighet:", propertyName],
    ["År:", year.toString()],
    ["Kvartal:", quarter],
    ["Exportdatum:", new Date().toLocaleDateString("sv-SE")],
    [],
    ["Sammanfattning"],
    ["Total antal uppgifter:", tasks.length.toString()],
    [
      "Klara:",
      tasksWithObjects.filter((t) => t.status === "Klar").length.toString(),
    ],
    [
      "Kvar:",
      tasksWithObjects.filter((t) => t.status === "Kvar").length.toString(),
    ],
    [
      "Saknas:",
      tasksWithObjects.filter((t) => t.status === "Saknas").length.toString(),
    ],
    [
      "Total planerade objekt:",
      tasksWithObjects.reduce((sum, t) => sum + t.planned_count, 0).toString(),
    ],
    [
      "Total redovisade objekt:",
      tasksWithObjects.reduce((sum, t) => sum + t.reported_count, 0).toString(),
    ],
  ];

  addAoASheet(wb, "Sammanfattning", summaryData);

  // Tasks overview sheet
  const tasksData = [
    ["Uppgift", "Beskrivning", "Planerade", "Redovisade", "Status"],
    ...tasksWithObjects.map((task) => [
      task.name,
      task.description || "",
      task.planned_count.toString(),
      task.reported_count.toString(),
      task.status,
    ]),
  ];

  addAoASheet(wb, "Uppgifter", tasksData);

  // Detailed objects sheet
  const objectsData = [
    ["Uppgift", "Objektnamn", "Serie-ID", "Reg.nr", "Redovisad"],
  ];

  tasksWithObjects.forEach((task) => {
    task.objects.forEach((obj) => {
      objectsData.push([
        task.name,
        obj.name,
        obj.series_id || "",
        obj.registration_number || "",
        obj.is_reported ? "Ja" : "Nej",
      ]);
    });
  });

  addAoASheet(wb, "Objekt", objectsData);

  // Generate filename and download
  const filename = `Drift_${propertyName}_${year}_${quarter}_${
    new Date().toISOString().split("T")[0]
  }.xlsx`;
  await downloadWorkbook(wb, filename);
}

export async function exportYearToExcel(
  propertyId: string,
  propertyName: string,
  year: number
) {
  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const wb = createWorkbook();

  // Summary for all quarters
  const yearSummaryData: any[][] = [
    ["Årssammanfattning - Driftuppföljning"],
    ["Fastighet:", propertyName],
    ["År:", year.toString()],
    ["Exportdatum:", new Date().toLocaleDateString("sv-SE")],
    [],
  ];

  for (const quarter of quarters) {
    const { data: tasks } = await supabase
      .from("drift_tasks")
      .select("*")
      .eq("property_id", propertyId)
      .eq("year", year)
      .eq("quarter", quarter as any);

    if (tasks && tasks.length > 0) {
      const completed = tasks.filter(
        (t) => t.reported_count >= t.planned_count
      ).length;
      const remaining = tasks.filter(
        (t) => t.reported_count > 0 && t.reported_count < t.planned_count
      ).length;
      const missing = tasks.filter((t) => t.reported_count === 0).length;

      yearSummaryData.push(
        [quarter],
        ["Totalt:", tasks.length.toString()],
        ["Klara:", completed.toString()],
        ["Kvar:", remaining.toString()],
        ["Saknas:", missing.toString()],
        []
      );
    }
  }

  addAoASheet(wb, "Årsöversikt", yearSummaryData);

  // Export each quarter to separate sheet
  for (const quarter of quarters) {
    const { data: tasks } = await supabase
      .from("drift_tasks")
      .select("*")
      .eq("property_id", propertyId)
      .eq("year", year)
      .eq("quarter", quarter as any);

    if (tasks && tasks.length > 0) {
      const tasksData = [
        ["Uppgift", "Beskrivning", "Planerade", "Redovisade", "Status"],
      ];

      for (const task of tasks) {
        const status =
          task.reported_count === 0
            ? "Saknas"
            : task.reported_count >= task.planned_count
            ? "Klar"
            : "Kvar";

        tasksData.push([
          task.name,
          task.description || "",
          task.planned_count.toString(),
          task.reported_count.toString(),
          status,
        ]);
      }

      addAoASheet(wb, quarter, tasksData);
    }
  }

  const filename = `Drift_${propertyName}_${year}_Årssammanfattning_${
    new Date().toISOString().split("T")[0]
  }.xlsx`;
  await downloadWorkbook(wb, filename);
}
