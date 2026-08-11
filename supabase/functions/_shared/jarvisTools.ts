/**
 * Jarvis orchestrator tools — read/query Liljeblads data + HITL write suggestions
 * + direct apply_* when user explicitly requests an action.
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
import { getResendClient, resendFrom } from "./resendClient.ts";

export type ToolContext = {
  supabase: SupabaseClient;
  orgId: string;
  userId: string;
  /** Authenticated user email only — never use model-supplied recipients for send */
  userEmail: string | null;
  conversationId?: string | null;
};

const WO_STATUSES = [
  "not_started",
  "awaiting_quote",
  "ordered",
  "completed",
  "archived",
] as const;

const PROJECT_STATUSES = [
  "forslag",
  "planerat",
  "invantar_offert",
  "offert_finns",
  "pagaende",
  "pausat",
  "avslutat",
] as const;

export const jarvisTools: ChatTool[] = [
  {
    type: "function",
    function: {
      name: "list_properties",
      description:
        "Lista organisationens fastigheter (namn, adress, fakturaadress/invoice_address, id).",
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
        "Föreslå ny arbetsorder (HITL-utkast). Skapas INTE i DB förrän användaren godkänner. Fyll contractor, quarter (t.ex. Q3 2026), due_date, price_estimate när känt.",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Åtgärd/beskrivning av jobbet" },
          property_name: { type: "string" },
          property_id: { type: "string" },
          component_name: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          price_estimate: { type: "number" },
          contractor: { type: "string" },
          quarter: { type: "string" },
          due_date: { type: "string", description: "YYYY-MM-DD" },
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
      name: "suggest_project",
      description:
        "Föreslå nytt projekt (HITL). Kräver fastighet. type: investering|underhall|energi|annat.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          property_name: { type: "string" },
          property_id: { type: "string" },
          description: { type: "string" },
          type: {
            type: "string",
            enum: ["investering", "underhall", "energi", "annat"],
          },
          budget: { type: "number" },
          year: { type: "number" },
          start_quarter: { type: "number", description: "1-4" },
          project_number: {
            type: "string",
            description: "Valfritt; genereras om tomt",
          },
          reasoning: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["name", "reasoning", "confidence"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_property_note",
      description:
        "Föreslå anteckning på en fastighet (HITL). content = anteckningstext.",
      parameters: {
        type: "object",
        properties: {
          property_name: { type: "string" },
          property_id: { type: "string" },
          content: { type: "string", description: "Anteckningens text" },
          reasoning: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["content", "reasoning", "confidence"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_update_invoice_address",
      description:
        "Föreslå uppdatering av fakturaadress på en befintlig fastighet (HITL).",
      parameters: {
        type: "object",
        properties: {
          property_name: { type: "string" },
          property_id: { type: "string" },
          invoice_address: {
            type: "string",
            description: "Ny fakturaadress (full text)",
          },
          reasoning: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["invoice_address", "reasoning", "confidence"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_create_property",
      description:
        "Föreslå ny fastighet i organisationen (HITL). Minst name krävs.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          address: { type: "string" },
          property_number: { type: "string" },
          property_type: { type: "string" },
          invoice_address: { type: "string" },
          construction_year: { type: "number" },
          area_sqm: { type: "number" },
          description: { type: "string" },
          reasoning: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["name", "reasoning", "confidence"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_update_property",
      description:
        "Föreslå uppdatering av befintlig fastighet (HITL). Endast fält som ska ändras.",
      parameters: {
        type: "object",
        properties: {
          property_name: { type: "string", description: "Befintlig fastighet att hitta" },
          property_id: { type: "string" },
          name: { type: "string" },
          address: { type: "string" },
          property_number: { type: "string" },
          property_type: { type: "string" },
          invoice_address: { type: "string" },
          construction_year: { type: "number" },
          area_sqm: { type: "number" },
          description: { type: "string" },
          reasoning: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["reasoning", "confidence"],
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
  {
    type: "function",
    function: {
      name: "get_property_overview",
      description:
        "Hämta samlad översikt för en fastighet: grunddata (inkl. fakturaadress/invoice_address, adress, fastighetsnummer), komponenter, öppna WO, todos, anteckningar, dokument, högrisk och underhållsplan. Använd vid frågor om fakturaadress eller en specifik fastighet.",
      parameters: {
        type: "object",
        properties: {
          property_name: { type: "string" },
          property_id: { type: "string" },
        },
      },
    },
  },
  // ── DIRECT actions (user explicitly asked — execute now, no HITL inbox) ──
  {
    type: "function",
    function: {
      name: "send_to_me",
      description:
        "Skicka e-post ENDAST till den inloggade användaren (dig själv). Använd när användaren ber dig skicka info, fakturaadress, sammanfattning m.m. till sig. ALDRIG extern mottagare — to/recipient ignoreras och blockeras.",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Ämnesrad" },
          body: {
            type: "string",
            description: "Meddelandetext (plain text). Inkludera all info användaren vill ha.",
          },
          property_name: {
            type: "string",
            description:
              "Valfritt: hämta fakturaadress/adress för fastighet och lägg till i mailet om body inte redan har det",
          },
        },
        required: ["subject", "body"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_work_order_status",
      description:
        "Ändra status på en arbetsorder DIREKT (när användaren uttryckligen ber om det). Status: not_started|awaiting_quote|ordered|completed|archived.",
      parameters: {
        type: "object",
        properties: {
          work_order_id: { type: "string" },
          action_contains: {
            type: "string",
            description: "Om id saknas: matcha WO action",
          },
          property_name: { type: "string" },
          status: {
            type: "string",
            enum: ["not_started", "awaiting_quote", "ordered", "completed", "archived"],
          },
        },
        required: ["status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_project_status",
      description:
        "Ändra projektstatus DIREKT. Status: forslag|planerat|invantar_offert|offert_finns|pagaende|pausat|avslutat.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          project_number: { type: "string" },
          name: { type: "string" },
          property_name: { type: "string" },
          status: {
            type: "string",
            enum: [
              "forslag",
              "planerat",
              "invantar_offert",
              "offert_finns",
              "pagaende",
              "pausat",
              "avslutat",
            ],
          },
        },
        required: ["status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_update_invoice_address",
      description:
        "Uppdatera fakturaadress på fastighet DIREKT (när användaren ber om det).",
      parameters: {
        type: "object",
        properties: {
          property_name: { type: "string" },
          property_id: { type: "string" },
          invoice_address: { type: "string" },
        },
        required: ["invoice_address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_create_work_order",
      description:
        "Skapa arbetsorder DIREKT i databasen (när användaren uttryckligen ber om att skapa/lägga till WO).",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string" },
          property_name: { type: "string" },
          property_id: { type: "string" },
          component_name: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          contractor: { type: "string" },
          quarter: { type: "string" },
          due_date: { type: "string" },
          price: { type: "number" },
          comments: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_create_project",
      description:
        "Skapa projekt DIREKT (när användaren ber om det). Kräver fastighet.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          property_name: { type: "string" },
          property_id: { type: "string" },
          description: { type: "string" },
          type: {
            type: "string",
            enum: ["investering", "underhall", "energi", "annat"],
          },
          budget: { type: "number" },
          year: { type: "number" },
          start_quarter: { type: "number" },
          project_number: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_property_note",
      description: "Lägg till anteckning på fastighet DIREKT.",
      parameters: {
        type: "object",
        properties: {
          property_name: { type: "string" },
          property_id: { type: "string" },
          content: { type: "string" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_create_property",
      description: "Skapa ny fastighet DIREKT.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          address: { type: "string" },
          property_number: { type: "string" },
          property_type: { type: "string" },
          invoice_address: { type: "string" },
          construction_year: { type: "number" },
          area_sqm: { type: "number" },
          description: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_update_property",
      description: "Uppdatera fastighetsfält DIREKT (adress, namn, m.m.).",
      parameters: {
        type: "object",
        properties: {
          property_name: { type: "string" },
          property_id: { type: "string" },
          name: { type: "string" },
          address: { type: "string" },
          property_number: { type: "string" },
          property_type: { type: "string" },
          invoice_address: { type: "string" },
          construction_year: { type: "number" },
          area_sqm: { type: "number" },
          description: { type: "string" },
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

async function resolveOneProperty(
  supabase: SupabaseClient,
  orgId: string,
  rawArgs: Record<string, unknown>,
): Promise<{ id: string; name: string; invoice_address?: string | null; address?: string | null; property_number?: string | null } | null> {
  const propId = String(rawArgs.property_id || "").trim();
  const propName = String(rawArgs.property_name || "").trim();
  if (!propId && !propName) return null;
  let q = supabase
    .from("properties")
    .select("id, name, invoice_address, address, property_number")
    .eq("organization_id", orgId)
    .limit(1);
  if (propId) q = q.eq("id", propId);
  else q = q.ilike("name", `%${propName}%`);
  const { data } = await q.maybeSingle();
  return data as {
    id: string;
    name: string;
    invoice_address?: string | null;
    address?: string | null;
    property_number?: string | null;
  } | null;
}

function generateProjectNumber(propertyNumber?: string | null): string {
  const base = (propertyNumber || "PRJ").replace(/\s+/g, "-").slice(0, 24);
  const year = new Date().getFullYear();
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `${base}-${year}-${suffix}`;
}

export async function executeJarvisTool(
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const { supabase, orgId, userId, userEmail, conversationId } = ctx;
  const limit = Math.min(Math.max(Number(rawArgs.limit) || 20, 1), 50);

  try {
    switch (name) {
      case "list_properties": {
        let q = supabase
          .from("properties")
          .select(
            "id, name, address, invoice_address, property_number, property_type",
          )
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
      case "suggest_project":
      case "suggest_property_note":
      case "suggest_update_invoice_address":
      case "suggest_create_property":
      case "suggest_update_property":
      case "suggest_todo": {
        const confidence = Number(rawArgs.confidence ?? 0.7);
        if (confidence < 0.5) {
          return {
            skipped: true,
            reason: "confidence < 0.5",
          };
        }
        const actionTypeMap: Record<string, string> = {
          suggest_work_order: "create_work_order",
          suggest_project: "create_project",
          suggest_property_note: "create_property_note",
          suggest_update_invoice_address: "update_property_invoice_address",
          suggest_create_property: "create_property",
          suggest_update_property: "update_property",
          suggest_todo: "create_todo",
        };
        const actionType = actionTypeMap[name];
        if (!actionType) return { error: `Okänt suggest-verktyg: ${name}` };

        // Light validation before storing HITL draft
        if (name === "suggest_work_order" && !String(rawArgs.action || "").trim()) {
          return { error: "action krävs för arbetsorder" };
        }
        if (name === "suggest_project" && !String(rawArgs.name || "").trim()) {
          return { error: "name krävs för projekt" };
        }
        if (
          name === "suggest_property_note" &&
          !String(rawArgs.content || "").trim()
        ) {
          return { error: "content krävs för anteckning" };
        }
        if (
          name === "suggest_update_invoice_address" &&
          !String(rawArgs.invoice_address || "").trim()
        ) {
          return { error: "invoice_address krävs" };
        }
        if (
          name === "suggest_create_property" &&
          !String(rawArgs.name || "").trim()
        ) {
          return { error: "name krävs för ny fastighet" };
        }
        if (
          name === "suggest_update_property" &&
          !String(rawArgs.property_id || rawArgs.property_name || "").trim()
        ) {
          return { error: "property_id eller property_name krävs" };
        }

        const payload = { ...rawArgs, source: "jarvis_chat" };
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
            "Förslag sparat som utkast. Användaren måste godkänna i Jarvis → Förslag innan det sparas i systemet.",
        };
      }

      // ── DIRECT: send only to authenticated user ──
      case "send_to_me": {
        // Hard security: never honor model-supplied recipients
        for (const forbidden of [
          "to",
          "recipient",
          "recipient_email",
          "email",
          "cc",
          "bcc",
        ]) {
          if (rawArgs[forbidden] != null && String(rawArgs[forbidden]).trim()) {
            return {
              error:
                "Säkerhet: e-post kan endast skickas till dig (inloggad användare). Extern mottagare är blockerad.",
              blocked_field: forbidden,
            };
          }
        }

        if (!userEmail || !userEmail.includes("@")) {
          return {
            error:
              "Ingen e-postadress på ditt konto — kan inte skicka. Kontrollera profil/inloggning.",
          };
        }

        let body = String(rawArgs.body || "").trim();
        const subject =
          String(rawArgs.subject || "Meddelande från Jarvis").trim() ||
          "Meddelande från Jarvis";

        const prop = await resolveOneProperty(supabase, orgId, rawArgs);
        if (prop) {
          const inv = prop.invoice_address?.trim();
          const addrBlock = [
            `Fastighet: ${prop.name}`,
            prop.property_number ? `Fastighetsnummer: ${prop.property_number}` : null,
            prop.address ? `Adress: ${prop.address}` : null,
            inv
              ? `Fakturaadress:\n${inv}`
              : "Fakturaadress: (ej registrerad i systemet)",
          ]
            .filter(Boolean)
            .join("\n");
          if (!body.includes(prop.name) || (inv && !body.includes(inv.split("\n")[0]))) {
            body = `${body}\n\n---\n${addrBlock}`;
          }
        }

        if (!body) {
          return { error: "Tomt meddelande — ange body" };
        }

        const resend = getResendClient();
        if (!resend) {
          return {
            error: "E-post är inte konfigurerad (RESEND_API_KEY saknas).",
            would_have_sent_to: userEmail.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
          };
        }

        const { data: sendData, error: sendErr } = await resend.emails.send({
          from: resendFrom(),
          to: [userEmail], // ONLY authenticated user
          subject: `[Jarvis] ${subject}`,
          text: body,
        });

        if (sendErr) {
          return { error: String(sendErr.message || sendErr), sent: false };
        }

        return {
          sent: true,
          to: userEmail.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
          to_note: "Skickat endast till inloggad användare",
          subject,
          resend_id: sendData?.id ?? null,
        };
      }

      case "apply_work_order_status": {
        const status = String(rawArgs.status || "").trim();
        if (!WO_STATUSES.includes(status as (typeof WO_STATUSES)[number])) {
          return {
            error: `Ogiltig status. Tillåtna: ${WO_STATUSES.join(", ")}`,
          };
        }

        let woId = String(rawArgs.work_order_id || "").trim();
        if (!woId) {
          const prop = await resolveOneProperty(supabase, orgId, rawArgs);
          const actionContains = String(rawArgs.action_contains || "").trim();
          let q = supabase
            .from("work_orders")
            .select("id, action, status, property_id, properties!inner(organization_id)")
            .eq("properties.organization_id", orgId)
            .order("created_at", { ascending: false })
            .limit(5);
          if (prop) q = q.eq("property_id", prop.id);
          if (actionContains) q = q.ilike("action", `%${actionContains}%`);
          const { data: found } = await q;
          if (!found?.length) {
            return { error: "Ingen arbetsorder matchade" };
          }
          woId = found[0].id as string;
        }

        // Verify org
        const { data: existing } = await supabase
          .from("work_orders")
          .select("id, action, status, property_id, properties!inner(organization_id, name)")
          .eq("id", woId)
          .maybeSingle();
        if (!existing) return { error: "Arbetsorder hittades inte" };
        const pOrg = (existing.properties as { organization_id?: string } | null)
          ?.organization_id;
        if (pOrg !== orgId) {
          return { error: "Arbetsordern tillhör inte din organisation" };
        }

        const { data: updated, error } = await supabase
          .from("work_orders")
          .update({ status })
          .eq("id", woId)
          .select("id, action, status, property_id")
          .single();
        if (error) return { error: error.message };
        return {
          applied: true,
          work_order: updated,
          previous_status: existing.status,
          property_name:
            (existing.properties as { name?: string } | null)?.name ?? null,
        };
      }

      case "apply_project_status": {
        const status = String(rawArgs.status || "").trim();
        if (!PROJECT_STATUSES.includes(status as (typeof PROJECT_STATUSES)[number])) {
          return {
            error: `Ogiltig status. Tillåtna: ${PROJECT_STATUSES.join(", ")}`,
          };
        }

        const { ids } = await resolvePropertyIds(
          supabase,
          orgId,
          String(rawArgs.property_name || "") || undefined,
        );
        if (!ids.length) return { error: "Ingen fastighet i organisationen" };

        let projectId = String(rawArgs.project_id || "").trim();
        if (!projectId) {
          let q = supabase
            .from("projects")
            .select("id, name, project_number, status, property_id")
            .in("property_id", ids)
            .limit(5);
          const pnum = String(rawArgs.project_number || "").trim();
          const pname = String(rawArgs.name || "").trim();
          if (pnum) q = q.ilike("project_number", `%${pnum}%`);
          if (pname) q = q.ilike("name", `%${pname}%`);
          const { data: found } = await q;
          if (!found?.length) return { error: "Inget projekt matchade" };
          projectId = found[0].id as string;
        }

        const { data: existing } = await supabase
          .from("projects")
          .select("id, name, status, property_id")
          .eq("id", projectId)
          .in("property_id", ids)
          .maybeSingle();
        if (!existing) {
          return { error: "Projekt hittades inte i din organisation" };
        }

        const { data: updated, error } = await supabase
          .from("projects")
          .update({ status })
          .eq("id", projectId)
          .select("id, name, project_number, status")
          .single();
        if (error) return { error: error.message };
        return {
          applied: true,
          project: updated,
          previous_status: existing.status,
        };
      }

      case "apply_update_invoice_address": {
        const inv = String(rawArgs.invoice_address || "").trim();
        if (!inv) return { error: "invoice_address krävs" };
        const prop = await resolveOneProperty(supabase, orgId, rawArgs);
        if (!prop) return { error: "Fastighet hittades inte" };
        const { data: updated, error } = await supabase
          .from("properties")
          .update({ invoice_address: inv })
          .eq("id", prop.id)
          .eq("organization_id", orgId)
          .select("id, name, invoice_address")
          .single();
        if (error) return { error: error.message };
        return { applied: true, property: updated };
      }

      case "apply_create_work_order": {
        const actionText = String(rawArgs.action || "").trim();
        if (!actionText) return { error: "action krävs" };
        const prop = await resolveOneProperty(supabase, orgId, rawArgs);
        if (!prop) {
          return {
            error: "Ange property_name eller property_id för arbetsordern",
          };
        }
        let componentId: string | null = null;
        const compName = String(rawArgs.component_name || "").trim();
        if (compName) {
          const { data: comp } = await supabase
            .from("components")
            .select("id")
            .eq("property_id", prop.id)
            .ilike("name", `%${compName}%`)
            .limit(1)
            .maybeSingle();
          componentId = comp?.id ?? null;
        }
        const priceRaw = rawArgs.price;
        const price =
          priceRaw != null && !Number.isNaN(Number(priceRaw))
            ? Number(priceRaw)
            : null;
        const { data: wo, error } = await supabase
          .from("work_orders")
          .insert({
            property_id: prop.id,
            component_id: componentId,
            action: actionText,
            priority: String(rawArgs.priority || "medium"),
            status: "not_started",
            contractor: (rawArgs.contractor as string) || null,
            quarter: (rawArgs.quarter as string) || null,
            due_date: (rawArgs.due_date as string) || null,
            price,
            comments:
              (rawArgs.comments as string) ||
              "Skapad via Jarvis (direkt på begäran)",
          })
          .select("id, action, status, property_id, contractor, quarter, due_date")
          .single();
        if (error) return { error: error.message };
        return {
          applied: true,
          work_order: wo,
          property_name: prop.name,
          link_hint: `/work-orders`,
        };
      }

      case "apply_create_project": {
        const pname = String(rawArgs.name || "").trim();
        if (!pname) return { error: "name krävs" };
        const prop = await resolveOneProperty(supabase, orgId, rawArgs);
        if (!prop) {
          return { error: "Ange fastighet (property_name/property_id)" };
        }
        const year = Number(rawArgs.year) || new Date().getFullYear();
        const startQuarter =
          Number(rawArgs.start_quarter) ||
          Math.ceil((new Date().getMonth() + 1) / 3);
        const ptype = (["investering", "underhall", "energi", "annat"] as const)
          .includes(rawArgs.type as "investering")
          ? String(rawArgs.type)
          : "underhall";
        const projectNumber =
          String(rawArgs.project_number || "").trim() ||
          generateProjectNumber(prop.property_number);
        const budget =
          rawArgs.budget != null && !Number.isNaN(Number(rawArgs.budget))
            ? Number(rawArgs.budget)
            : null;
        const { data: project, error } = await supabase
          .from("projects")
          .insert({
            property_id: prop.id,
            name: pname,
            description: (rawArgs.description as string) || null,
            status: "planerat",
            type: ptype,
            project_number: projectNumber,
            year,
            start_quarter: startQuarter,
            budget,
            created_by: userId,
          })
          .select("id, name, project_number, status, type")
          .single();
        if (error) return { error: error.message };
        return {
          applied: true,
          project,
          property_name: prop.name,
          link_hint: `/projects/${project.id}`,
        };
      }

      case "apply_property_note": {
        const content = String(rawArgs.content || "").trim();
        if (!content) return { error: "content krävs" };
        const prop = await resolveOneProperty(supabase, orgId, rawArgs);
        if (!prop) return { error: "Ange fastighet" };
        const { data: note, error } = await supabase
          .from("property_notes")
          .insert({ property_id: prop.id, content })
          .select("id, property_id, content, created_at")
          .single();
        if (error) return { error: error.message };
        return {
          applied: true,
          note: { ...note, content: content.slice(0, 200) },
          property_name: prop.name,
        };
      }

      case "apply_create_property": {
        const nameProp = String(rawArgs.name || "").trim();
        if (!nameProp) return { error: "name krävs" };
        const insert: Record<string, unknown> = {
          name: nameProp,
          organization_id: orgId,
          owner_id: userId,
          address: (rawArgs.address as string) || null,
          property_number: (rawArgs.property_number as string) || null,
          property_type: (rawArgs.property_type as string) || null,
          invoice_address: (rawArgs.invoice_address as string) || null,
          description: (rawArgs.description as string) || null,
        };
        if (rawArgs.construction_year != null) {
          insert.construction_year = Number(rawArgs.construction_year);
        }
        if (rawArgs.area_sqm != null) {
          insert.area_sqm = Number(rawArgs.area_sqm);
        }
        const { data: created, error } = await supabase
          .from("properties")
          .insert(insert)
          .select("id, name, address, invoice_address")
          .single();
        if (error) return { error: error.message };
        return {
          applied: true,
          property: created,
          link_hint: `/property/${created.id}`,
        };
      }

      case "apply_update_property": {
        const prop = await resolveOneProperty(supabase, orgId, rawArgs);
        if (!prop) return { error: "Ange fastighet att uppdatera" };
        const patch: Record<string, unknown> = {};
        for (const key of [
          "name",
          "address",
          "property_number",
          "property_type",
          "invoice_address",
          "description",
        ] as const) {
          if (rawArgs[key] != null && String(rawArgs[key]).trim() !== "") {
            patch[key] = rawArgs[key];
          }
        }
        if (rawArgs.construction_year != null) {
          patch.construction_year = Number(rawArgs.construction_year);
        }
        if (rawArgs.area_sqm != null) {
          patch.area_sqm = Number(rawArgs.area_sqm);
        }
        if (!Object.keys(patch).length) {
          return { error: "Inga fält att uppdatera" };
        }
        const { data: updated, error } = await supabase
          .from("properties")
          .update(patch)
          .eq("id", prop.id)
          .eq("organization_id", orgId)
          .select("id, name, address, invoice_address, property_number")
          .single();
        if (error) return { error: error.message };
        return { applied: true, property: updated };
      }

      case "get_property_overview": {
        const propName = String(rawArgs.property_name || "").trim();
        const propIdArg = String(rawArgs.property_id || "").trim();
        if (!propName && !propIdArg) {
          return { error: "property_name eller property_id krävs" };
        }
        let pq = supabase
          .from("properties")
          .select(
            "id, name, address, invoice_address, area_sqm, construction_year, property_type, property_number, description, loa",
          )
          .eq("organization_id", orgId)
          .limit(1);
        if (propIdArg) pq = pq.eq("id", propIdArg);
        else pq = pq.ilike("name", `%${propName}%`);
        const { data: prop, error: pErr } = await pq.maybeSingle();
        if (pErr) return { error: pErr.message };
        if (!prop) return { error: "Fastighet hittades inte" };
        const pid = prop.id as string;

        const [comps, wos, todos, notes, docs, plan] = await Promise.all([
          supabase
            .from("components")
            .select("id, name, type, status, installation_year, manufacturer, model")
            .eq("property_id", pid)
            .neq("status", "decommissioned")
            .order("name")
            .limit(120),
          supabase
            .from("work_orders")
            .select("id, action, status, priority, price, due_date")
            .eq("property_id", pid)
            .in("status", ["not_started", "awaiting_quote", "ordered"])
            .limit(25),
          supabase
            .from("property_todos")
            .select("id, title, priority, due_date, completed")
            .eq("property_id", pid)
            .eq("completed", false)
            .limit(25),
          supabase
            .from("property_notes")
            .select("id, content, created_at")
            .eq("property_id", pid)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("property_documents")
            .select("id, name, mime_type, created_at")
            .eq("property_id", pid)
            .order("created_at", { ascending: false })
            .limit(30),
          supabase
            .from("maintenance_plans")
            .select("id, name, start_year, start_quarter, horizon_years, status, generated_at")
            .eq("property_id", pid)
            .eq("status", "active")
            .order("generated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        const components = comps.data ?? [];
        const compIds = components.map((c) => c.id as string);
        let highRisk: Array<Record<string, unknown>> = [];
        if (compIds.length) {
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
              propertyId: pid,
              propertyName: prop.name as string,
              installationYear: (c.installation_year as number | null) ?? null,
              purchaseDate: (p?.purchase_date as string | null) ?? null,
              expectedLifespanYears:
                (p?.expected_lifespan_years as number | null) ?? null,
              history: histMap.get(c.id as string) ?? [],
            };
          });
          highRisk = filterRiskResults(computeComponentRiskBatch(inputs), {
            minLevel: "medium",
            limit: 10,
          }).map((r) => ({
            name: r.name,
            risk_level: r.riskLevel,
            risk_score: r.riskScore,
            remaining_b10_years: r.remainingB10Years,
            recommendation: r.recommendation,
          }));
        }

        return {
          property: prop,
          counts: {
            components: components.length,
            open_work_orders: (wos.data ?? []).length,
            open_todos: (todos.data ?? []).length,
            notes: (notes.data ?? []).length,
            documents: (docs.data ?? []).length,
            high_risk: highRisk.length,
          },
          components: components.slice(0, 60),
          open_work_orders: wos.data ?? [],
          open_todos: todos.data ?? [],
          notes: (notes.data ?? []).map((n) => ({
            excerpt: String(n.content || "").slice(0, 300),
            created_at: n.created_at,
          })),
          documents: docs.data ?? [],
          high_risk_components: highRisk,
          maintenance_plan: plan.data ?? null,
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
