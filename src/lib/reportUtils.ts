import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { createWorkbook, addJsonSheet, downloadWorkbook } from "./excelUtils";

interface Task {
  id: string;
  name: string;
  description: string | null;
  planned_count: number;
  reported_count: number;
  quarter: string;
  category?: {
    name: string;
  };
}

export async function generateYearReport(
  propertyId: string,
  propertyName: string,
  year: number,
  format: "excel" | "pdf" = "excel"
) {
  try {
    const quarters = ["Q1", "Q2", "Q3", "Q4"];
    const allData: any[] = [];

    // Fetch data for all quarters
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

      if (error) throw error;

      if (data) {
        allData.push(
          ...data.map((task: any) => ({
            Kvartal: quarter,
            Kategori: task.drift_categories?.name || "Ingen",
            Uppgift: task.name,
            Beskrivning: task.description || "",
            Planerat: task.planned_count,
            Redovisat: task.reported_count,
            Status:
              task.reported_count === 0
                ? "Saknas"
                : task.reported_count >= task.planned_count
                ? "Klar"
                : "Pågår",
            "Completion %":
              task.planned_count > 0
                ? Math.round((task.reported_count / task.planned_count) * 100)
                : 0,
          }))
        );
      }
    }

    if (format === "excel") {
      const wb = createWorkbook();

      // Summary sheet
      const summaryData = quarters.map((q) => {
        const qData = allData.filter((d) => d.Kvartal === q);
        const completed = qData.filter((d) => d.Status === "Klar").length;
        const missing = qData.filter((d) => d.Status === "Saknas").length;
        const inProgress = qData.filter((d) => d.Status === "Pågår").length;
        const total = qData.length;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

        return {
          Kvartal: q,
          Totalt: total,
          Klara: completed,
          Pågår: inProgress,
          Saknas: missing,
          "Completion %": completionRate,
        };
      });

      addJsonSheet(wb, "Sammanfattning", summaryData);

      // All tasks sheet
      addJsonSheet(wb, "Alla uppgifter", allData);

      // Quarter-specific sheets
      quarters.forEach((q) => {
        const qData = allData.filter((d) => d.Kvartal === q);
        if (qData.length > 0) {
          addJsonSheet(wb, q, qData);
        }
      });

      await downloadWorkbook(wb, `${propertyName}_Årsrapport_${year}.xlsx`);
    } else {
      // PDF format
      const doc = new jsPDF();

      doc.setFontSize(18);
      doc.text(`Årsrapport ${year}`, 14, 20);
      doc.setFontSize(12);
      doc.text(propertyName, 14, 28);

      // Summary table
      const summaryData = quarters.map((q) => {
        const qData = allData.filter((d) => d.Kvartal === q);
        const completed = qData.filter((d) => d.Status === "Klar").length;
        const total = qData.length;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

        return [q, total, completed, `${completionRate}%`];
      });

      autoTable(doc, {
        startY: 35,
        head: [["Kvartal", "Totalt", "Klara", "Completion"]],
        body: summaryData,
      });

      // Detailed tasks
      doc.addPage();
      doc.text("Detaljerad lista", 14, 20);

      autoTable(doc, {
        startY: 25,
        head: [["Kvartal", "Uppgift", "Planerat", "Redovisat", "Status"]],
        body: allData.map((d) => [
          d.Kvartal,
          d.Uppgift,
          d.Planerat,
          d.Redovisat,
          d.Status,
        ]),
        styles: { fontSize: 8 },
      });

      doc.save(`${propertyName}_Årsrapport_${year}.pdf`);
    }
  } catch (error) {
    console.error("Error generating year report:", error);
    throw error;
  }
}

export async function generateCategoryReport(
  propertyId: string,
  propertyName: string,
  year: number,
  quarter: string,
  format: "excel" | "pdf" = "excel"
) {
  try {
    const { data, error } = await supabase
      .from("drift_tasks")
      .select(
        `
        id,
        name,
        description,
        planned_count,
        reported_count,
        category_id,
        drift_categories (name)
      `
      )
      .eq("property_id", propertyId)
      .eq("year", year)
      .eq("quarter", quarter as "Q1" | "Q2" | "Q3" | "Q4")
      .order("category_id");

    if (error) throw error;

    // Group by category
    const grouped = (data || []).reduce((acc: any, task: any) => {
      const catName = task.drift_categories?.name || "Ingen kategori";
      if (!acc[catName]) {
        acc[catName] = [];
      }
      acc[catName].push(task);
      return acc;
    }, {});

    if (format === "excel") {
      const wb = createWorkbook();

      // Category summary
      const summaryData = Object.entries(grouped).map(([cat, tasks]: any) => {
        const total = tasks.length;
        const completed = tasks.filter(
          (t: any) => t.reported_count >= t.planned_count
        ).length;
        const completionRate =
          total > 0 ? Math.round((completed / total) * 100) : 0;

        return {
          Kategori: cat,
          "Antal uppgifter": total,
          Klara: completed,
          "Completion %": completionRate,
        };
      });

      addJsonSheet(wb, "Sammanfattning", summaryData);

      // Detailed sheets per category
      Object.entries(grouped).forEach(([cat, tasks]: any) => {
        const taskData = tasks.map((t: any) => ({
          Uppgift: t.name,
          Beskrivning: t.description || "",
          Planerat: t.planned_count,
          Redovisat: t.reported_count,
          Status:
            t.reported_count === 0
              ? "Saknas"
              : t.reported_count >= t.planned_count
              ? "Klar"
              : "Pågår",
        }));
        addJsonSheet(wb, cat.substring(0, 31), taskData);
      });

      await downloadWorkbook(
        wb,
        `${propertyName}_Kategorirapport_${quarter}_${year}.xlsx`
      );
    } else {
      // PDF
      const doc = new jsPDF();

      doc.setFontSize(18);
      doc.text(`Kategorirapport ${quarter} ${year}`, 14, 20);
      doc.setFontSize(12);
      doc.text(propertyName, 14, 28);

      let yPos = 35;

      Object.entries(grouped).forEach(([cat, tasks]: any) => {
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(14);
        doc.text(cat, 14, yPos);
        yPos += 5;

        const taskData = tasks.map((t: any) => [
          t.name,
          t.planned_count,
          t.reported_count,
          t.reported_count >= t.planned_count ? "Klar" : "Pågår",
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [["Uppgift", "Planerat", "Redovisat", "Status"]],
          body: taskData,
          styles: { fontSize: 9 },
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
      });

      doc.save(`${propertyName}_Kategorirapport_${quarter}_${year}.pdf`);
    }
  } catch (error) {
    console.error("Error generating category report:", error);
    throw error;
  }
}

export async function generateDeviationReport(
  propertyId: string,
  propertyName: string,
  year: number,
  threshold: number = 0.2,
  format: "excel" | "pdf" = "excel"
) {
  try {
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
      .order("quarter");

    if (error) throw error;

    // Filter tasks with significant deviation
    const deviations = (data || [])
      .map((task: any) => {
        const deviation =
          task.planned_count > 0
            ? Math.abs(task.reported_count - task.planned_count) /
              task.planned_count
            : 0;
        const deviationPercent = Math.round(deviation * 100);

        return {
          ...task,
          deviation,
          deviationPercent,
          deviationAmount: Math.abs(task.reported_count - task.planned_count),
          status:
            task.reported_count > task.planned_count ? "Överrapportering" : "Underrapportering",
        };
      })
      .filter((task: any) => task.deviation >= threshold);

    if (deviations.length === 0) {
      throw new Error(`Inga avvikelser över ${threshold * 100}% hittades`);
    }

    const reportData = deviations.map((d: any) => ({
      Kvartal: d.quarter,
      Kategori: d.drift_categories?.name || "Ingen",
      Uppgift: d.name,
      Planerat: d.planned_count,
      Redovisat: d.reported_count,
      Avvikelse: d.deviationAmount,
      "Avvikelse %": d.deviationPercent,
      Typ: d.status,
    }));

    if (format === "excel") {
      const wb = createWorkbook();
      addJsonSheet(wb, "Avvikelser", reportData);

      await downloadWorkbook(wb, `${propertyName}_Avvikelser_${year}.xlsx`);
    } else {
      const doc = new jsPDF();

      doc.setFontSize(18);
      doc.text(`Avvikelserapport ${year}`, 14, 20);
      doc.setFontSize(12);
      doc.text(propertyName, 14, 28);
      doc.text(`Tröskelvärde: ${threshold * 100}%`, 14, 34);

      autoTable(doc, {
        startY: 40,
        head: [
          ["Kvartal", "Uppgift", "Planerat", "Redovisat", "Avvikelse %", "Typ"],
        ],
        body: reportData.map((d: any) => [
          d.Kvartal,
          d.Uppgift,
          d.Planerat,
          d.Redovisat,
          `${d["Avvikelse %"]}%`,
          d.Typ,
        ]),
        styles: { fontSize: 9 },
      });

      doc.save(`${propertyName}_Avvikelser_${year}.pdf`);
    }
  } catch (error) {
    console.error("Error generating deviation report:", error);
    throw error;
  }
}
