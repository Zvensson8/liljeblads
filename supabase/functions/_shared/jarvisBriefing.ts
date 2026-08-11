/**
 * Shared daily briefing builder for Jarvis chat + cron emails.
 * Pure data aggregation — no external recipients beyond org member emails.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  computeComponentRiskBatch,
  filterRiskResults,
  type ComponentRiskInput,
} from "./componentRisk.ts";

export type BriefingStats = {
  orgId: string;
  orgName: string;
  openWorkOrders: number;
  overdueWorkOrders: number;
  openProjects: number;
  pendingTodos: number;
  pendingAiActions: number;
  highRiskComponents: number;
  overdueItems: Array<{ kind: string; title: string; due_date: string; property?: string }>;
  highRiskSample: Array<{ name: string; risk_level: string; property_name?: string | null }>;
  generatedAt: string;
};

export async function buildDailyBriefing(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BriefingStats> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();

  const { data: props } = await supabase
    .from("properties")
    .select("id, name")
    .eq("organization_id", orgId);
  const propIds = (props ?? []).map((p) => p.id as string);
  const propNames = new Map((props ?? []).map((p) => [p.id as string, p.name as string]));

  let openWorkOrders = 0;
  let overdueWorkOrders = 0;
  let openProjects = 0;
  let pendingTodos = 0;
  let highRiskComponents = 0;
  const overdueItems: BriefingStats["overdueItems"] = [];
  const highRiskSample: BriefingStats["highRiskSample"] = [];

  if (propIds.length) {
    const { data: wos } = await supabase
      .from("work_orders")
      .select("id, action, due_date, status, property_id")
      .in("property_id", propIds)
      .in("status", ["not_started", "awaiting_quote", "ordered"])
      .limit(200);
    openWorkOrders = wos?.length ?? 0;
    for (const w of wos ?? []) {
      if (w.due_date && String(w.due_date) < today) {
        overdueWorkOrders++;
        if (overdueItems.length < 8) {
          overdueItems.push({
            kind: "work_order",
            title: String(w.action || "WO"),
            due_date: String(w.due_date),
            property: propNames.get(w.property_id as string),
          });
        }
      }
    }

    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, status, property_id")
      .in("property_id", propIds)
      .in("status", [
        "forslag",
        "planerat",
        "invantar_offert",
        "offert_finns",
        "pagaende",
      ])
      .limit(100);
    openProjects = projects?.length ?? 0;

    const { data: todos } = await supabase
      .from("property_todos")
      .select("id, title, due_date, completed, property_id")
      .in("property_id", propIds)
      .eq("completed", false)
      .limit(100);
    pendingTodos = todos?.length ?? 0;
    for (const t of todos ?? []) {
      if (t.due_date && String(t.due_date) < today && overdueItems.length < 12) {
        overdueItems.push({
          kind: "todo",
          title: String(t.title || "Todo"),
          due_date: String(t.due_date),
          property: propNames.get(t.property_id as string),
        });
      }
    }

    // Light risk sample (cap components for performance)
    const { data: components } = await supabase
      .from("components")
      .select("id, name, type, installation_year, property_id")
      .in("property_id", propIds)
      .neq("status", "decommissioned")
      .limit(300);

    if (components?.length) {
      const compIds = components.map((c) => c.id as string);
      const [purchaseRes, histRes] = await Promise.all([
        supabase
          .from("component_purchase_info")
          .select("component_id, expected_lifespan_years, purchase_date")
          .in("component_id", compIds),
        supabase
          .from("maintenance_history")
          .select("component_id, performed_date, category")
          .in("component_id", compIds),
      ]);
      const purchaseMap = new Map(
        (purchaseRes.data ?? []).map((p) => [p.component_id as string, p]),
      );
      const histMap = new Map<
        string,
        Array<{ performed_date: string; category: string | null }>
      >();
      for (const h of histRes.data ?? []) {
        const cid = h.component_id as string;
        const list = histMap.get(cid) ?? [];
        list.push({
          performed_date: h.performed_date as string,
          category: (h.category as string | null) ?? null,
        });
        histMap.set(cid, list);
      }
      const inputs: ComponentRiskInput[] = components.map((c) => {
        const p = purchaseMap.get(c.id as string);
        return {
          componentId: c.id as string,
          name: c.name as string,
          type: (c.type as string) ?? null,
          propertyId: c.property_id as string,
          propertyName: propNames.get(c.property_id as string) ?? null,
          installationYear: (c.installation_year as number | null) ?? null,
          purchaseDate: (p?.purchase_date as string | null) ?? null,
          expectedLifespanYears:
            (p?.expected_lifespan_years as number | null) ?? null,
          history: histMap.get(c.id as string) ?? [],
        };
      });
      const high = filterRiskResults(computeComponentRiskBatch(inputs), {
        minLevel: "high",
        limit: 10,
      });
      highRiskComponents = high.length;
      for (const r of high.slice(0, 5)) {
        highRiskSample.push({
          name: r.name,
          risk_level: r.riskLevel,
          property_name: r.propertyName,
        });
      }
    }
  }

  const { count: aiCount } = await supabase
    .from("ai_suggested_actions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "pending");

  return {
    orgId,
    orgName: (org?.name as string) || orgId,
    openWorkOrders,
    overdueWorkOrders,
    openProjects,
    pendingTodos,
    pendingAiActions: aiCount ?? 0,
    highRiskComponents,
    overdueItems,
    highRiskSample,
    generatedAt: new Date().toISOString(),
  };
}

export function formatBriefingPlain(stats: BriefingStats): string {
  const lines = [
    `Jarvis daglig briefing – ${stats.orgName}`,
    `Genererad: ${stats.generatedAt.slice(0, 16).replace("T", " ")} UTC`,
    ``,
    `📊 NYCKELTAL`,
    `• Öppna arbetsordrar: ${stats.openWorkOrders} (förfallna: ${stats.overdueWorkOrders})`,
    `• Aktiva projekt: ${stats.openProjects}`,
    `• Öppna todos: ${stats.pendingTodos}`,
    `• Väntande AI-förslag: ${stats.pendingAiActions}`,
    `• Högrisk-komponenter: ${stats.highRiskComponents}`,
  ];

  if (stats.overdueItems.length) {
    lines.push(``, `⚠️ FÖRFALLNA / SENAST`);
    for (const item of stats.overdueItems) {
      lines.push(
        `• [${item.kind}] ${item.title}${item.property ? ` (${item.property})` : ""} – ${item.due_date}`,
      );
    }
  }

  if (stats.highRiskSample.length) {
    lines.push(``, `🔴 HÖGRISK (urval)`);
    for (const r of stats.highRiskSample) {
      lines.push(
        `• ${r.name} – ${r.risk_level}${r.property_name ? ` (${r.property_name})` : ""}`,
      );
    }
  }

  lines.push(
    ``,
    `Öppna Jarvis i appen för att agera på punkterna.`,
  );
  return lines.join("\n");
}
