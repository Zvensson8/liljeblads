/**
 * Jarvis orchestrator tools — read/query Liljeblads data + HITL write suggestions.
 * Used by ai-chat multi-turn tool loop.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ChatTool } from "./llmClient.ts";
import {
  computeComponentRiskBatch,
  filterRiskResults,
  type ComponentRiskInput,
  type RiskLevel,
} from "./componentRisk.ts";

export type ToolContext = {
  supabase: SupabaseClient;
  orgId: string;
  userId: string;
  conversationId?: string | null;
};

export const jarvisTools: ChatTool[] = [
  {
    type: "function",
    function: {
      name: "list_properties",
      description: "Lista organisationens fastigheter (namn, adress, id).",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Valfri söksträng i namn/adress",
          },
          limit: { type: "number", description: "Max antal (default 30)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_project",
      description:
        "Hämta ett projekt via projektnummer eller namn, inkl. budget och status.",
      parameters: {
        type: "object",
        properties: {
          project_number: { type: "string" },
          name: { type: "string" },
          property_name: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_work_orders",
      description:
        "Lista arbetsordrar filtrerat på fastighet, status och/eller söktext.",
      parameters: {
        type: "object",
        properties: {
          property_name: { type: "string" },
          status: {
            type: "string",
            description:
              "not_started | in_progress | completed | cancelled (valfritt)",
          },
          query: { type: "string", description: "Sök i action/comments" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_services",
      description:
        "Lista service/underhållshistorik för en fastighet eller komponent.",
      parameters: {
        type: "object",
        properties: {
          property_name: { type: "string" },
          component_name: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_components",
      description:
        "Sök komponenter efter namn, beteckning, serienummer eller fastighet.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          property_name: { type: "string" },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_work_order_order_text",
      description:
        "Skapa utkast till beställningstext för en befintlig arbetsorder (skickar INTE e-post).",
      parameters: {
        type: "object",
        properties: {
          work_order_id: {
            type: "string",
            description: "UUID för arbetsordern",
          },
          action_contains: {
            type: "string",
            description: "Om id saknas: hitta WO vars action innehåller texten",
          },
          property_name: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_work_order",
      description:
        "Föreslå ny arbetsorder som utkast (human-in-the-loop). Skapas INTE automatiskt i databasen förrän användaren godkänner i UI.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string" },
          property_name: { type: "string" },
          component_name: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          price_estimate: { type: "number" },
          contractor: { type: "string" },
          reasoning: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["action", "reasoning", "confidence"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_todo",
      description: "Föreslå en att-göra-uppgift (utkast, kräver godkännande).",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          property_name: { type: "string" },
          due_date: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          reasoning: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["title", "reasoning", "confidence"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_property_documents",
      description:
        "Sök i indexerade fastighetsdokument (PDF/text) med semantisk sökning.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          property_name: { type: "string" },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_high_risk_components",
      description:
        "Lista komponenter med högst prediktiv risk (Weibull-baserad). Använd för frågor om risk, prioritering, högrisk, B10, utbyte.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max antal (default 10)" },
          min_level: {
            type: "string",
            description: "low | medium | high | critical (default high)",
          },
          property_name: { type: "string" },
          min_confidence: {
            type: "string",
            description: "low | medium | high — default medium",
          },
        },
      },
    },
  },
];

async function resolvePropertyIds(
  supabase: SupabaseClient,
  orgId: string,
  propertyName?: string,
): Promise<{ ids: string[]; names: Map<string, string> }> {
  let q = supabase
    .from("properties")
    .select("id, name")
    .eq("organization_id", orgId);
  if (propertyName?.trim()) {
    q = q.ilike("name", `%${propertyName.trim()}%`);
  }
  const { data } = await q.limit(50);
  const names = new Map((data || []).map((p) => [p.id as string, p.name as string]));
  return { ids: [...names.keys()], names };
}

export async function executeJarvisTool(
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const { supabase, orgId, conversationId } = ctx;
  const limit = Math.min(Math.max(Number(rawArgs.limit) || 20, 1), 50);

  try {
    switch (name) {
      case "list_properties": {
        let q = supabase
          .from("properties")
          .select("id, name, address, property_number, property_type")
          .eq("organization_id", orgId)
          .order("name")
          .limit(limit);
        const query = String(rawArgs.query || "").trim();
        if (query) {
          q = q.or(`name.ilike.%${query}%,address.ilike.%${query}%`);
        }
        const { data, error } = await q;
        if (error) return { error: error.message };
        return { count: data?.length || 0, properties: data || [] };
      }

      case "get_project": {
        const { ids } = await resolvePropertyIds(
          supabase,
          orgId,
          String(rawArgs.property_name || ""),
        );
        if (!ids.length) return { error: "Inga fastigheter i organisationen" };

        let q = supabase
          .from("projects")
          .select(
            "id, name, project_number, status, type, budget, forecast, actual_cost, year, start_date, end_date, description, property_id, property:properties(name)",
          )
          .in("property_id", ids)
          .limit(10);

        const pnum = String(rawArgs.project_number || "").trim();
        const pname = String(rawArgs.name || "").trim();
        if (pnum) q = q.ilike("project_number", `%${pnum}%`);
        if (pname) q = q.ilike("name", `%${pname}%`);

        const { data, error } = await q;
        if (error) return { error: error.message };
        if (!data?.length) return { found: false, message: "Inget projekt matchade" };
        return { found: true, projects: data };
      }

      case "list_work_orders": {
        const propName = String(rawArgs.property_name || "").trim();
        const { ids, names } = await resolvePropertyIds(
          supabase,
          orgId,
          propName || undefined,
        );
        if (!ids.length) return { count: 0, work_orders: [] };

        let q = supabase
          .from("work_orders")
          .select(
            "id, action, status, priority, price, contractor, due_date, comments, property_id, component_id, created_at",
          )
          .in("property_id", ids)
          .order("created_at", { ascending: false })
          .limit(limit);

        const status = String(rawArgs.status || "").trim();
        if (status) q = q.eq("status", status);
        const query = String(rawArgs.query || "").trim();
        if (query) q = q.or(`action.ilike.%${query}%,comments.ilike.%${query}%`);

        const { data, error } = await q;
        if (error) return { error: error.message };

        const rows = (data || []).map((w) => ({
          ...w,
          property_name: names.get(w.property_id as string) || null,
        }));
        return { count: rows.length, work_orders: rows };
      }

      case "list_services": {
        const propName = String(rawArgs.property_name || "").trim();
        const compName = String(rawArgs.component_name || "").trim();
        const { ids } = await resolvePropertyIds(
          supabase,
          orgId,
          propName || undefined,
        );
        if (!ids.length) return { count: 0, services: [] };

        let cq = supabase
          .from("components")
          .select("id, name, property_id")
          .in("property_id", ids);
        if (compName) cq = cq.ilike("name", `%${compName}%`);
        const { data: comps } = await cq.limit(100);
        const compIds = (comps || []).map((c) => c.id as string);
        if (!compIds.length) return { count: 0, services: [] };

        const compMap = new Map(
          (comps || []).map((c) => [c.id as string, c.name as string]),
        );

        const { data, error } = await supabase
          .from("maintenance_history")
          .select(
            "id, action_type, performed_date, cost, supplier, notes, category, component_id",
          )
          .in("component_id", compIds)
          .order("performed_date", { ascending: false })
          .limit(limit);

        if (error) return { error: error.message };
        const services = (data || []).map((s) => ({
          ...s,
          component_name: compMap.get(s.component_id as string) || null,
        }));
        return { count: services.length, services };
      }

      case "search_components": {
        const query = String(rawArgs.query || "").trim();
        const propName = String(rawArgs.property_name || "").trim();
        const { ids, names } = await resolvePropertyIds(
          supabase,
          orgId,
          propName || undefined,
        );
        if (!ids.length) return { count: 0, components: [] };

        let q = supabase
          .from("components")
          .select(
            "id, name, type, status, manufacturer, model, serial_number, registration_number, property_id, notes",
          )
          .in("property_id", ids)
          .limit(limit);

        if (query) {
          q = q.or(
            `name.ilike.%${query}%,serial_number.ilike.%${query}%,registration_number.ilike.%${query}%,manufacturer.ilike.%${query}%,model.ilike.%${query}%`,
          );
        }

        const { data, error } = await q;
        if (error) return { error: error.message };
        const components = (data || []).map((c) => ({
          ...c,
          property_name: names.get(c.property_id as string) || null,
        }));
        return { count: components.length, components };
      }

      case "draft_work_order_order_text": {
        let woId = String(rawArgs.work_order_id || "").trim();
        if (!woId) {
          const propName = String(rawArgs.property_name || "").trim();
          const actionContains = String(rawArgs.action_contains || "").trim();
          const { ids } = await resolvePropertyIds(
            supabase,
            orgId,
            propName || undefined,
          );
          if (!ids.length) return { error: "Ingen fastighet hittades" };
          let q = supabase
            .from("work_orders")
            .select("id, action, comments, price, contractor, property_id")
            .in("property_id", ids)
            .order("created_at", { ascending: false })
            .limit(5);
          if (actionContains) q = q.ilike("action", `%${actionContains}%`);
          const { data: found } = await q;
          if (!found?.length) {
            return { error: "Ingen arbetsorder hittades att basera utkast på" };
          }
          woId = found[0].id as string;
        }

        const { data: wo, error } = await supabase
          .from("work_orders")
          .select(
            `
            id, action, comments, price, contractor, due_date, quarter,
            property:properties!inner(id, name, address, invoice_address, property_number, organization_id, organization:organizations(name))
          `,
          )
          .eq("id", woId)
          .single();

        if (error || !wo) return { error: error?.message || "WO saknas" };
        const prop = wo.property as Record<string, unknown> | null;
        if ((prop?.organization_id as string) !== orgId) {
          return { error: "Arbetsordern tillhör inte din organisation" };
        }

        const orgName =
          (prop?.organization as { name?: string } | null)?.name ||
          "Vår organisation";
        const propertyName = (prop?.name as string) || "Fastigheten";
        const propertyAddress = (prop?.address as string) || "";
        const invoiceAddress =
          (prop?.invoice_address as string) || propertyAddress;
        const propertyNumber = (prop?.property_number as string) || "";

        const draft = [
          `Hej,`,
          ``,
          `Vi vill härmed beställa följande arbete:`,
          ``,
          `Fastighet: ${propertyName}${propertyAddress ? `, ${propertyAddress}` : ""}`,
          `Åtgärd: ${wo.action}`,
          wo.comments ? `Beskrivning: ${wo.comments}` : null,
          wo.quarter ? `Planerat kvartal: ${wo.quarter}` : null,
          wo.price ? `Estimerat pris: ${wo.price} kr` : null,
          wo.contractor ? `Entreprenör: ${wo.contractor}` : null,
          wo.due_date ? `Önskat slutdatum: ${wo.due_date}` : null,
          ``,
          `Fakturering:`,
          `- Fakturaadress: ${invoiceAddress || "enligt avtal"}`,
          propertyNumber
            ? `- Märk fakturan med fastighetsnummer: ${propertyNumber}`
            : null,
          `- Skicka faktura till: scanning@innagroup.com`,
          ``,
          `Vänligen bekräfta mottagande samt preliminärt startdatum.`,
          ``,
          `Med vänliga hälsningar,`,
          orgName,
        ]
          .filter((x) => x !== null)
          .join("\n");

        return {
          work_order_id: woId,
          property_name: propertyName,
          draft_text: draft,
          note: "Utkast — skickas inte automatiskt. Användaren kan redigera innan utskick.",
        };
      }

      case "suggest_work_order":
      case "suggest_todo": {
        const confidence = Number(rawArgs.confidence ?? 0.7);
        if (confidence < 0.5) {
          return {
            skipped: true,
            reason: "confidence < 0.5",
          };
        }
        const actionType =
          name === "suggest_work_order" ? "create_work_order" : "create_todo";
        const payload = { ...rawArgs };
        const row: Record<string, unknown> = {
          organization_id: orgId,
          action_type: actionType,
          payload,
          confidence_score: confidence,
          reasoning: String(rawArgs.reasoning || ""),
          status: "pending",
        };
        if (conversationId) row.conversation_id = conversationId;

        const { data: inserted, error } = await supabase
          .from("ai_suggested_actions")
          .insert(row)
          .select("id, action_type, confidence_score, reasoning, status")
          .single();

        if (error) return { error: error.message, stored: false };
        return {
          stored: true,
          suggestion: inserted,
          message:
            "Förslag sparat som utkast. Användaren måste godkänna i AI-inkorgen innan det skapas.",
        };
      }

      case "list_high_risk_components": {
        const { ids, names } = await resolvePropertyIds(
          supabase,
          orgId,
          String(rawArgs.property_name || "") || undefined,
        );
        if (!ids.length) return { count: 0, components: [] };

        const { data: components, error: cErr } = await supabase
          .from("components")
          .select("id, name, type, installation_year, property_id")
          .in("property_id", ids)
          .neq("status", "decommissioned");
        if (cErr) return { error: cErr.message };
        if (!components?.length) return { count: 0, components: [] };

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
            type: c.type as string,
            propertyId: c.property_id as string,
            propertyName: names.get(c.property_id as string) ?? null,
            installationYear: (c.installation_year as number | null) ?? null,
            purchaseDate: (p?.purchase_date as string | null) ?? null,
            expectedLifespanYears:
              (p?.expected_lifespan_years as number | null) ?? null,
            history: histMap.get(c.id as string) ?? [],
          };
        });

        const minLevel = (String(rawArgs.min_level || "high") ||
          "high") as RiskLevel;
        const minConf = (String(rawArgs.min_confidence || "medium") ||
          "medium") as "low" | "medium" | "high";
        const batch = computeComponentRiskBatch(inputs);
        const filtered = filterRiskResults(batch, {
          minLevel,
          minConfidence: minConf,
          limit: Math.min(limit, 25),
        });

        return {
          count: filtered.length,
          components: filtered.map((r) => ({
            id: r.componentId,
            name: r.name,
            type: r.type,
            property_name: r.propertyName,
            risk_level: r.riskLevel,
            risk_score: r.riskScore,
            confidence: r.confidence,
            recommendation: r.recommendation,
            age_years: r.ageYears,
            remaining_b10_years: r.remainingB10Years,
          })),
        };
      }

      case "search_property_documents": {
        const query = String(rawArgs.query || "").trim();
        if (!query) return { error: "query krävs" };

        // Prefer embeddings table filtered by org + optional property name in content
        const apiKey =
          Deno.env.get("GOOGLE_AI_API_KEY") || Deno.env.get("GEMINI_API_KEY") || "";
        if (!apiKey) {
          return { error: "GOOGLE_AI_API_KEY saknas för dokumentsök" };
        }

        const embResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: { parts: [{ text: query }] },
              outputDimensionality: 768,
            }),
          },
        );
        if (!embResp.ok) {
          return { error: `Embedding failed ${embResp.status}` };
        }
        const embData = await embResp.json();
        const values = embData.embedding?.values || [];

        const { data: hits, error } = await supabase.rpc(
          "semantic_search_ranked",
          {
            query_embedding: JSON.stringify(values),
            match_threshold: 0.28,
            match_count: Math.min(limit, 8),
            org_id: orgId,
            filter_tables: ["property_documents"],
            boost_recent: true,
            boost_popular: false,
          },
        );
        if (error) return { error: error.message };

        let results = hits || [];
        const propFilter = String(rawArgs.property_name || "").trim().toLowerCase();
        if (propFilter) {
          results = results.filter((h: { content?: string }) =>
            (h.content || "").toLowerCase().includes(propFilter),
          );
        }

        return {
          count: results.length,
          documents: results.map((h: {
            source_id?: string;
            content?: string;
            similarity?: number;
          }) => ({
            source_id: h.source_id,
            similarity: h.similarity,
            excerpt: (h.content || "").substring(0, 1500),
          })),
        };
      }

      default:
        return { error: `Okänt verktyg: ${name}` };
    }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
