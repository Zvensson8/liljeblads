import JSZip from "jszip";
import { saveAs } from "file-saver";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface Project {
  id: string;
  project_number: string;
  name: string;
  description?: string;
  status: string;
  type: string;
  start_date?: string;
  end_date?: string;
  budget?: number;
  actual_cost?: number;
}

interface WorkOrder {
  id: string;
  action: string;
  due_date?: string;
  status: string;
  priority: string;
  contractor?: string;
  price?: number;
  comments?: string;
  quarter?: string;
}

export async function exportProjectToZip(projectId: string) {
  try {
    const zip = new JSZip();

    // Hämta projektdata
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (projectError) throw projectError;

    // Skapa projektinfo-fil
    const projectInfo = generateProjectInfo(project);
    zip.file("Projektinformation.txt", projectInfo);

    // Hämta och lägg till dokument
    const { data: documents } = await supabase
      .from("project_documents")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (documents && documents.length > 0) {
      const docsFolder = zip.folder("Dokument");
      for (const doc of documents) {
        try {
          const response = await fetch(doc.file_url);
          const blob = await response.blob();
          docsFolder?.file(doc.name, blob);
        } catch (error) {
          console.error(`Kunde inte ladda dokument: ${doc.name}`, error);
        }
      }
    }

    // Hämta och lägg till checklista
    const { data: checklist } = await supabase
      .from("project_checklist_items")
      .select("*")
      .eq("project_id", projectId)
      .order("order_index", { ascending: true });

    if (checklist && checklist.length > 0) {
      const checklistText = generateChecklistText(checklist);
      zip.file("Checklista.txt", checklistText);
    }

    // Hämta och lägg till aktivitetslogg
    const { data: activities } = await supabase
      .from("project_activity_log")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (activities && activities.length > 0) {
      const activitiesText = generateActivitiesText(activities);
      zip.file("Aktivitetslogg.txt", activitiesText);
    }

    // Hämta och lägg till kostnadsposter
    const { data: costs } = await supabase
      .from("project_cost_items")
      .select("*")
      .eq("project_id", projectId)
      .order("cost_date", { ascending: false });

    if (costs && costs.length > 0) {
      const costsText = generateCostsText(costs);
      zip.file("Kostnader.txt", costsText);
    }

    // Hämta och lägg till budgetposter
    const { data: budget } = await supabase
      .from("project_budget_items")
      .select("*")
      .eq("project_id", projectId);

    if (budget && budget.length > 0) {
      const budgetText = generateBudgetText(budget);
      zip.file("Budget.txt", budgetText);
    }

    // Generera och ladda ner ZIP
    const content = await zip.generateAsync({ type: "blob" });
    const filename = `${project.project_number}_${project.name}.zip`;
    saveAs(content, filename);

    return { success: true };
  } catch (error: any) {
    console.error("Export error:", error);
    throw new Error(`Kunde inte exportera projekt: ${error.message}`);
  }
}

export async function exportWorkOrderToZip(workOrderId: string) {
  try {
    const zip = new JSZip();

    // Hämta arbetsorder-data
    const { data: workOrder, error: workOrderError } = await supabase
      .from("work_orders")
      .select("*, properties(name)")
      .eq("id", workOrderId)
      .single();

    if (workOrderError) throw workOrderError;

    // Skapa arbetsorder-info-fil
    const workOrderInfo = generateWorkOrderInfo(workOrder);
    zip.file("Arbetsorder_information.txt", workOrderInfo);

    // Hämta och lägg till filer
    const { data: files } = await supabase
      .from("work_order_files")
      .select("*")
      .eq("work_order_id", workOrderId)
      .order("created_at", { ascending: false });

    if (files && files.length > 0) {
      const filesFolder = zip.folder("Filer");
      for (const file of files) {
        try {
          const response = await fetch(file.file_url);
          const blob = await response.blob();
          filesFolder?.file(file.name, blob);
        } catch (error) {
          console.error(`Kunde inte ladda fil: ${file.name}`, error);
        }
      }
    }

    // Generera och ladda ner ZIP
    const content = await zip.generateAsync({ type: "blob" });
    const dateStr = workOrder.due_date 
      ? format(new Date(workOrder.due_date), "yyyy-MM-dd", { locale: sv })
      : format(new Date(), "yyyy-MM-dd", { locale: sv });
    const filename = `${workOrder.action}_${dateStr}.zip`;
    saveAs(content, filename);

    return { success: true };
  } catch (error: any) {
    console.error("Export error:", error);
    throw new Error(`Kunde inte exportera arbetsorder: ${error.message}`);
  }
}

function generateProjectInfo(project: Project): string {
  const statusLabels: Record<string, string> = {
    planerat: "Planerat",
    pagaende: "Pågående",
    avslutat: "Avslutat",
    pausat: "Pausat",
  };

  const typeLabels: Record<string, string> = {
    underhall: "Underhåll",
    nybyggnation: "Nybyggnation",
    renovering: "Renovering",
    omb_tillb: "Ombyggnad/Tillbyggnad",
  };

  return `PROJEKTINFORMATION
==================

Projektnummer: ${project.project_number || "-"}
Namn: ${project.name}
Status: ${statusLabels[project.status] || project.status}
Typ: ${typeLabels[project.type] || project.type}

Beskrivning:
${project.description || "Ingen beskrivning"}

TIDSPLAN
--------
Startdatum: ${project.start_date ? format(new Date(project.start_date), "PPP", { locale: sv }) : "-"}
Slutdatum: ${project.end_date ? format(new Date(project.end_date), "PPP", { locale: sv }) : "-"}

EKONOMI
-------
Budget: ${project.budget ? `${Number(project.budget).toLocaleString("sv-SE")} kr` : "-"}
Faktisk kostnad: ${project.actual_cost ? `${Number(project.actual_cost).toLocaleString("sv-SE")} kr` : "-"}
`;
}

function generateWorkOrderInfo(workOrder: any): string {
  const statusLabels: Record<string, string> = {
    not_started: "Ej påbörjad",
    awaiting_quote: "Inväntar offert",
    ordered: "Beställt",
    completed: "Slutförd",
    archived: "Arkiverad",
  };

  const priorityLabels: Record<string, string> = {
    low: "Låg",
    medium: "Medel",
    high: "Hög",
  };

  return `ARBETSORDER
===========

Åtgärd: ${workOrder.action}
Fastighet: ${workOrder.properties?.name || "-"}
Status: ${statusLabels[workOrder.status] || workOrder.status}
Prioritet: ${priorityLabels[workOrder.priority] || workOrder.priority}

DETALJER
--------
Entreprenör: ${workOrder.contractor || "-"}
Pris: ${workOrder.price ? `${Number(workOrder.price).toLocaleString("sv-SE")} kr` : "-"}
Datum: ${workOrder.due_date ? format(new Date(workOrder.due_date), "PPP", { locale: sv }) : "-"}
Kvartal: ${workOrder.quarter || "-"}

KOMMENTAR
---------
${workOrder.comments || "Ingen kommentar"}
`;
}

function generateChecklistText(checklist: any[]): string {
  let text = `CHECKLISTA
==========

`;
  checklist.forEach((item, index) => {
    const status = item.completed ? "✓" : "☐";
    const completedAt = item.completed_at
      ? ` (Slutförd: ${format(new Date(item.completed_at), "PPP", { locale: sv })})`
      : "";
    text += `${status} ${item.title}${completedAt}\n`;
  });

  return text;
}

function generateActivitiesText(activities: any[]): string {
  let text = `AKTIVITETSLOGG
==============

`;
  activities.forEach((activity) => {
    const date = format(new Date(activity.created_at), "PPP HH:mm", { locale: sv });
    text += `[${date}] ${activity.activity_type}\n${activity.description}\n\n`;
  });

  return text;
}

function generateCostsText(costs: any[]): string {
  let text = `KOSTNADER
=========

`;
  let total = 0;
  costs.forEach((cost) => {
    const date = format(new Date(cost.cost_date), "PPP", { locale: sv });
    const amount = Number(cost.amount);
    total += amount;
    text += `${date} - ${cost.description}\n`;
    text += `  Kategori: ${cost.category || "-"}\n`;
    text += `  Aktör: ${cost.actor || "-"}\n`;
    text += `  Belopp: ${amount.toLocaleString("sv-SE")} kr\n\n`;
  });

  text += `\nTOTALT: ${total.toLocaleString("sv-SE")} kr\n`;

  return text;
}

function generateBudgetText(budget: any[]): string {
  let text = `BUDGET
======

`;
  let totalBudget = 0;
  let totalForecast = 0;
  
  budget.forEach((item) => {
    const budgeted = Number(item.budgeted_amount);
    const forecasted = item.forecasted_amount ? Number(item.forecasted_amount) : 0;
    totalBudget += budgeted;
    totalForecast += forecasted;
    
    text += `${item.description}\n`;
    text += `  Kategori: ${item.category || "-"}\n`;
    text += `  Budgeterat: ${budgeted.toLocaleString("sv-SE")} kr\n`;
    if (forecasted > 0) {
      text += `  Prognos: ${forecasted.toLocaleString("sv-SE")} kr\n`;
    }
    text += `\n`;
  });

  text += `\nTOTAL BUDGET: ${totalBudget.toLocaleString("sv-SE")} kr\n`;
  if (totalForecast > 0) {
    text += `TOTAL PROGNOS: ${totalForecast.toLocaleString("sv-SE")} kr\n`;
  }

  return text;
}
