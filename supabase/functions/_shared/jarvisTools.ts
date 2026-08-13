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
import { buildDailyBriefing, formatBriefingPlain } from "./jarvisBriefing.ts";
import {
  BATCH_MAX_ACTIONS,
  extractReversePayload,
  findIdempotentHit,
  undoActionById,
  undoDeadline,
  undoLastAction,
  UNDO_WINDOW_MS,
} from "./jarvisUndo.ts";
import { checkRateLimit } from "./rateLimit.ts";

export type ToolContext = {
  supabase: SupabaseClient;
  orgId: string;
  userId: string;
  /** Authenticated user email only — never use model-supplied recipients for send */
  userEmail: string | null;
  conversationId?: string | null;
  /** Org membership role (owner|admin|member|viewer) — viewer cannot apply */
  memberRole?: string | null;
  /** Optional UI route context (property/project where user is browsing) */
  pageContext?: {
    property_id?: string;
    project_id?: string;
    component_id?: string;
    path?: string;
  } | null;
};

/** Critical property columns — always return these so Jarvis cannot claim "saknas" without data */
const PROPERTY_SELECT =
  "id, name, address, invoice_address, property_number, property_type, area_sqm, construction_year, loa, description, created_at, updated_at";

const PROJECT_SELECT =
  "id, name, project_number, status, type, budget, forecast, actual_cost, year, start_quarter, end_quarter, start_date, end_date, description, property_id, actors, created_at";

const WORK_ORDER_SELECT =
  "id, action, status, priority, price, contractor, due_date, quarter, comments, property_id, component_id, project_id, created_at, updated_at";

function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (/email|password|token|secret/i.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    if (typeof v === "string" && v.length > 400) {
      out[k] = v.slice(0, 400) + "…";
    } else {
      out[k] = v;
    }
  }
  return out;
}

function summarizeResult(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== "object") {
    return { raw: String(result).slice(0, 200) };
  }
  const r = result as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const key of [
    "applied",
    "sent",
    "error",
    "previous_status",
    "property_name",
    "link_hint",
    "to_note",
  ]) {
    if (r[key] !== undefined) summary[key] = r[key];
  }
  if (r.work_order && typeof r.work_order === "object") {
    const w = r.work_order as Record<string, unknown>;
    summary.work_order = { id: w.id, action: w.action, status: w.status };
  }
  if (r.project && typeof r.project === "object") {
    const p = r.project as Record<string, unknown>;
    summary.project = {
      id: p.id,
      name: p.name,
      project_number: p.project_number,
      status: p.status,
    };
  }
  if (r.property && typeof r.property === "object") {
    const p = r.property as Record<string, unknown>;
    summary.property = { id: p.id, name: p.name };
  }
  if (r.error) summary.error = String(r.error).slice(0, 500);
  return summary;
}

function extractEntity(
  toolName: string,
  r: Record<string, unknown>,
): { entity_type: string | null; entity_id: string | null } {
  if (r.work_order && typeof r.work_order === "object") {
    return {
      entity_type: "work_order",
      entity_id: String((r.work_order as { id?: string }).id || "") || null,
    };
  }
  if (r.project && typeof r.project === "object") {
    return {
      entity_type: "project",
      entity_id: String((r.project as { id?: string }).id || "") || null,
    };
  }
  if (r.property && typeof r.property === "object") {
    return {
      entity_type: "property",
      entity_id: String((r.property as { id?: string }).id || "") || null,
    };
  }
  if (r.note && typeof r.note === "object") {
    return {
      entity_type: "property_note",
      entity_id: String((r.note as { id?: string }).id || "") || null,
    };
  }
  if (r.component && typeof r.component === "object") {
    return {
      entity_type: "component",
      entity_id: String((r.component as { id?: string }).id || "") || null,
    };
  }
  if (r.service && typeof r.service === "object") {
    return {
      entity_type: "maintenance_history",
      entity_id: String((r.service as { id?: string }).id || "") || null,
    };
  }
  if (r.contact && typeof r.contact === "object") {
    return {
      entity_type: "property_contact",
      entity_id: String((r.contact as { id?: string }).id || "") || null,
    };
  }
  if (r.todo && typeof r.todo === "object") {
    return {
      entity_type: "property_todo",
      entity_id: String((r.todo as { id?: string }).id || "") || null,
    };
  }
  if (toolName === "send_to_me") return { entity_type: "email", entity_id: null };
  return { entity_type: null, entity_id: null };
}

async function logJarvisAction(
  ctx: ToolContext,
  toolName: string,
  rawArgs: Record<string, unknown>,
  result: unknown,
): Promise<string | null> {
  try {
    const r = (result && typeof result === "object"
      ? result as Record<string, unknown>
      : {}) as Record<string, unknown>;
    // Don't re-log pure idempotent replays as new rows
    if (r.idempotent_replay === true) return (r.action_log_id as string) || null;

    const success = !r.error &&
      (r.applied === true || r.sent === true || r.stored === true || r.undone === true);
    const { entity_type, entity_id } = extractEntity(toolName, r);
    const reverse = extractReversePayload(toolName, r);
    const idempotencyKey =
      String(rawArgs.idempotency_key || rawArgs.client_request_id || "").trim() ||
      null;

    const resultFull = {
      ...r,
      // strip huge fields if any
    };

    // Only store UUID conversation ids (invalid values abort the whole insert)
    const convRaw = String(ctx.conversationId || "").trim();
    const conversationId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          .test(convRaw)
        ? convRaw
        : null;

    const baseRow: Record<string, unknown> = {
      organization_id: ctx.orgId,
      user_id: ctx.userId,
      conversation_id: conversationId,
      tool_name: toolName,
      args_summary: redactArgs(rawArgs),
      result_summary: summarizeResult(result),
      success: Boolean(success || (r.sent === true)),
      entity_type,
      entity_id,
      link_hint: (r.link_hint as string) || null,
    };

    // Prefer P2 columns; fall back if migration not applied yet
    let insertPayload: Record<string, unknown> = {
      ...baseRow,
      result_full: resultFull,
      reverse_payload: reverse,
      idempotency_key: idempotencyKey,
    };

    let { data: inserted, error } = await ctx.supabase
      .from("jarvis_action_log")
      .insert(insertPayload)
      .select("id, created_at")
      .single();

    if (
      error &&
      /result_full|reverse_payload|idempotency_key|column/i.test(error.message)
    ) {
      console.warn(
        "[jarvis_action_log] P2 columns missing — insert without reverse/idempotency. Run migration 20260811210000.",
      );
      ({ data: inserted, error } = await ctx.supabase
        .from("jarvis_action_log")
        .insert(baseRow)
        .select("id, created_at")
        .single());
    }

    if (error) {
      // Unique idempotency race: fetch existing
      if (idempotencyKey && /duplicate|unique/i.test(error.message)) {
        const hit = await findIdempotentHit(
          { supabase: ctx.supabase, orgId: ctx.orgId, userId: ctx.userId },
          idempotencyKey,
        );
        return hit?.id ?? null;
      }
      console.error("[jarvis_action_log]", error.message);
      return null;
    }

    return (inserted?.id as string) || null;
  } catch (e) {
    console.error("[jarvis_action_log]", e instanceof Error ? e.message : e);
    return null;
  }
}

const BATCHABLE_TOOLS = new Set([
  "apply_create_work_order",
  "apply_create_project",
  "apply_property_note",
  "apply_create_todo",
  "apply_complete_todo",
  "apply_create_component",
  "apply_log_service",
  "apply_create_contact",
  "apply_work_order_status",
  "apply_project_status",
  "apply_update_invoice_address",
  "apply_update_property",
  "apply_update_component",
  "apply_update_contact",
  "apply_add_project_cost",
  "apply_add_budget_item",
  "apply_complete_checklist_item",
]);

/** Build deep-link for chat confirmation cards */
function withDeepLink(
  result: Record<string, unknown>,
  opts: { entity_type?: string; entity_id?: string; path?: string },
): Record<string, unknown> {
  const link =
    opts.path ||
    (opts.entity_type === "work_order"
      ? "/work-orders"
      : opts.entity_type === "project" && opts.entity_id
      ? `/projects/${opts.entity_id}`
      : opts.entity_type === "property" && opts.entity_id
      ? `/property/${opts.entity_id}`
      : null);
  return {
    ...result,
    link_hint: link,
    ui: {
      entity_type: opts.entity_type ?? null,
      entity_id: opts.entity_id ?? null,
      link,
      confirm: true,
    },
  };
}

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

const COMPONENT_STATUSES = [
  "active",
  "inactive",
  "maintenance",
  "needs_repair",
  "decommissioned",
] as const;

const COMPONENT_TYPES = new Set([
  "SC1",
  "SC2.1.1",
  "SC2.3",
  "SC2.3.1",
  "SC2.3.3",
  "SC2.3.4",
  "SC2.3.7",
  "SC2.6.2",
  "SC4.1.2.5.1",
  "SC4.1.2.5.3",
  "SC4.1.6.9",
  "SC4.2.4.6",
  "SC4.2.4.7",
  "SC4.5.1",
  "SC4.6.2.6",
  "SC4.6.2.6.1",
  "SC4.7",
  "SC5.5",
  "SC7.1",
  "SC7.2",
]);

/** Map common Swedish labels → SC code */
function normalizeComponentType(raw?: string | null): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  if (COMPONENT_TYPES.has(t)) return t;
  const lower = t.toLowerCase();
  if (lower.includes("värmepump") || lower.includes("varmepump")) return "SC4.6.2.6";
  if (lower.includes("vent") || lower.includes("luft")) return "SC4.7";
  if (lower.includes("hiss")) return "SC7.1";
  if (lower.includes("kyl")) return "SC4.5.1";
  if (lower.includes("port")) return "SC2.3.3";
  if (lower.includes("fjärrvärme") || lower.includes("varmvaxel")) return "SC4.1.6.9";
  // Accept "SC4.7 something"
  const m = t.match(/\bSC[\d.]+/i);
  if (m && COMPONENT_TYPES.has(m[0].toUpperCase().replace(/^sc/i, "SC"))) {
    const code = m[0].toUpperCase().startsWith("SC") ? m[0].replace(/^sc/i, "SC") : m[0];
    if (COMPONENT_TYPES.has(code)) return code;
  }
  return null;
}

export const jarvisTools: ChatTool[] = [
  {
    type: "function",
    function: {
      name: "list_properties",
      description:
        "Lista organisationens fastigheter med alla kritiska fält: namn, adress, invoice_address (fakturaadress), property_number, property_type, area_sqm, construction_year, loa, description, id.",
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
        "Ändra status på en arbetsorder DIREKT när användaren ber om det. Inkluderar arkivering (status archived) — det är INTE permanent radering, ingen extra bekräftelse. 'Ta bort'/'radera' en WO = archived. Status: not_started|awaiting_quote|ordered|completed|archived.",
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
        "Ändra projektstatus DIREKT, ingen extra bekräftelse. 'Arkivera'/'ta bort' projekt = status avslutat + is_archived (reversibelt). Status: forslag|planerat|invantar_offert|offert_finns|pagaende|pausat|avslutat|archived.",
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
              "archived",
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
  // ── P1: component / service / contact ──
  {
    type: "function",
    function: {
      name: "list_contacts",
      description: "Lista kontakter på en fastighet (namn, roll, bolag, e-post, telefon).",
      parameters: {
        type: "object",
        properties: {
          property_name: { type: "string" },
          property_id: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_daily_briefing",
      description:
        "Hämta dagens briefing för organisationen: öppna/förfallna WO, projekt, todos, AI-förslag, högrisk. Använd vid 'briefing', 'morgonstatus', 'vad händer idag'. Kombineras med send_to_me om användaren vill ha mejl.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_property_documents",
      description:
        "Lista uppladdade fastighetsdokument (PDF m.m.) och om de är AI-indexerade. Använd när användaren frågar vilka dokument som finns, zip-uppladdning, protokoll, avtal.",
      parameters: {
        type: "object",
        properties: {
          property_name: { type: "string" },
          property_id: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_document_ingest_batches",
      description:
        "Lista senaste zip/mapp/uppladdningsbatcher för en fastighet (P3 ingest).",
      parameters: {
        type: "object",
        properties: {
          property_name: { type: "string" },
          property_id: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_create_component",
      description:
        "Skapa komponent DIREKT på en fastighet. type = SC-kod (t.ex. SC4.6.2.6 värmepump, SC4.7 vent). Kräver name + fastighet.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          property_name: { type: "string" },
          property_id: { type: "string" },
          type: {
            type: "string",
            description: "SC-kod, t.ex. SC4.7, SC4.6.2.6, SC7.1",
          },
          status: {
            type: "string",
            enum: ["active", "inactive", "maintenance", "needs_repair", "decommissioned"],
          },
          manufacturer: { type: "string" },
          model: { type: "string" },
          serial_number: { type: "string" },
          installation_year: { type: "number" },
          notes: { type: "string" },
          supplier: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_update_component",
      description:
        "Uppdatera befintlig komponent DIREKT (status, tillverkare, modell, m.m.).",
      parameters: {
        type: "object",
        properties: {
          component_id: { type: "string" },
          component_name: { type: "string" },
          property_name: { type: "string" },
          property_id: { type: "string" },
          name: { type: "string" },
          type: { type: "string" },
          status: {
            type: "string",
            enum: ["active", "inactive", "maintenance", "needs_repair", "decommissioned"],
          },
          manufacturer: { type: "string" },
          model: { type: "string" },
          serial_number: { type: "string" },
          installation_year: { type: "number" },
          notes: { type: "string" },
          next_service_date: { type: "string" },
          supplier: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_log_service",
      description:
        "Logga service/underhållshistorik DIREKT på en komponent (maintenance_history).",
      parameters: {
        type: "object",
        properties: {
          component_id: { type: "string" },
          component_name: { type: "string" },
          property_name: { type: "string" },
          property_id: { type: "string" },
          action_type: {
            type: "string",
            description: "t.ex. service, reparation, inspektion, filterbyte",
          },
          performed_date: { type: "string", description: "YYYY-MM-DD (default idag)" },
          cost: { type: "number" },
          supplier: { type: "string" },
          notes: { type: "string" },
          category: { type: "string" },
          is_warranty: { type: "boolean" },
        },
        required: ["action_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_create_contact",
      description: "Lägg till kontakt på en fastighet DIREKT.",
      parameters: {
        type: "object",
        properties: {
          property_name: { type: "string" },
          property_id: { type: "string" },
          name: { type: "string" },
          role: { type: "string" },
          company: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_update_contact",
      description: "Uppdatera befintlig fastighetskontakt DIREKT.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string" },
          contact_name: { type: "string", description: "Hitta kontakt via namn om id saknas" },
          property_name: { type: "string" },
          property_id: { type: "string" },
          name: { type: "string" },
          role: { type: "string" },
          company: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_create_todo",
      description: "Skapa att-göra på fastighet DIREKT.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          property_name: { type: "string" },
          property_id: { type: "string" },
          due_date: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_complete_todo",
      description:
        "Markera en att-göra som klar DIREKT (completed=true). Matcha via todo_id eller title + fastighet.",
      parameters: {
        type: "object",
        properties: {
          todo_id: { type: "string" },
          title: { type: "string" },
          property_name: { type: "string" },
          property_id: { type: "string" },
          completed: {
            type: "boolean",
            description: "Default true. Sätt false för att öppna igen.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_todos",
      description: "Lista öppna (eller alla) todos för en fastighet.",
      parameters: {
        type: "object",
        properties: {
          property_name: { type: "string" },
          property_id: { type: "string" },
          include_completed: { type: "boolean" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_add_project_cost",
      description:
        "Lägg till en faktisk kostnadspost på ett projekt DIREKT (project_cost_items).",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          project_number: { type: "string" },
          name: { type: "string", description: "Projektnamn om id saknas" },
          property_name: { type: "string" },
          description: { type: "string" },
          amount: { type: "number" },
          cost_date: { type: "string", description: "YYYY-MM-DD default idag" },
          category: { type: "string" },
          actor: { type: "string" },
        },
        required: ["description", "amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_add_budget_item",
      description: "Lägg till budgetrad på projekt DIREKT (project_budget_items).",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          project_number: { type: "string" },
          name: { type: "string" },
          property_name: { type: "string" },
          description: { type: "string" },
          budgeted_amount: { type: "number" },
          forecasted_amount: { type: "number" },
          category: { type: "string" },
        },
        required: ["description", "budgeted_amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_project_costs",
      description: "Lista kostnadsposter och budgetrader för ett projekt.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
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
      name: "apply_complete_checklist_item",
      description:
        "Markera en checklistepunkt på projekt som klar DIREKT (eller öppna igen).",
      parameters: {
        type: "object",
        properties: {
          checklist_item_id: { type: "string" },
          title: { type: "string" },
          project_id: { type: "string" },
          project_number: { type: "string" },
          property_name: { type: "string" },
          completed: { type: "boolean" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_create_component",
      description: "Föreslå ny komponent (HITL).",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          property_name: { type: "string" },
          property_id: { type: "string" },
          type: { type: "string" },
          manufacturer: { type: "string" },
          model: { type: "string" },
          installation_year: { type: "number" },
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
      name: "suggest_log_service",
      description: "Föreslå servicehistorik-rad (HITL).",
      parameters: {
        type: "object",
        properties: {
          component_name: { type: "string" },
          component_id: { type: "string" },
          property_name: { type: "string" },
          action_type: { type: "string" },
          performed_date: { type: "string" },
          cost: { type: "number" },
          supplier: { type: "string" },
          notes: { type: "string" },
          reasoning: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["action_type", "reasoning", "confidence"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggest_create_contact",
      description: "Föreslå ny kontakt på fastighet (HITL).",
      parameters: {
        type: "object",
        properties: {
          property_name: { type: "string" },
          property_id: { type: "string" },
          name: { type: "string" },
          role: { type: "string" },
          company: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          reasoning: { type: "string" },
          confidence: { type: "number" },
        },
        required: ["name", "reasoning", "confidence"],
      },
    },
  },
  // ── P2: undo / batch / idempotency ──
  {
    type: "function",
    function: {
      name: "undo_last_action",
      description:
        "Ångra senaste ångringsbara Jarvis-åtgärden (inom 5 minuter). Använd när användaren säger ångra/ta tillbaka. E-post kan inte ångras.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "undo_jarvis_action",
      description:
        "Ångra en specifik Jarvis-åtgärd via action_log_id (inom 5 min).",
      parameters: {
        type: "object",
        properties: {
          action_log_id: { type: "string", description: "UUID från action_log_id" },
        },
        required: ["action_log_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "batch_apply_actions",
      description:
        "Kör flera apply_* i följd (max 10). Använd t.ex. när användaren ber skapa WO på flera högrisk-komponenter. Varje delsteg loggas. stop_on_error default true.",
      parameters: {
        type: "object",
        properties: {
          actions: {
            type: "array",
            description:
              "Lista { tool: apply_*, args: {...}, idempotency_key?: string }",
            items: {
              type: "object",
              properties: {
                tool: { type: "string" },
                args: { type: "object" },
                idempotency_key: { type: "string" },
              },
            },
          },
          stop_on_error: { type: "boolean" },
        },
        required: ["actions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_recent_jarvis_actions",
      description:
        "Lista dina senaste Jarvis-åtgärder (för spårbarhet / vilken som kan ångras).",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max 20, default 10" },
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

type ResolvedProperty = {
  id: string;
  name: string;
  invoice_address?: string | null;
  address?: string | null;
  property_number?: string | null;
  property_type?: string | null;
  area_sqm?: number | null;
  construction_year?: number | null;
  loa?: string | null;
  description?: string | null;
};

type PropertyResolve =
  | { ok: true; property: ResolvedProperty }
  | { ok: false; error: string; candidates?: Array<{ id: string; name: string }> };

/** Fas 1C: never silently pick among multiple name matches */
async function resolveOnePropertyDetailed(
  supabase: SupabaseClient,
  orgId: string,
  rawArgs: Record<string, unknown>,
  pageContext?: ToolContext["pageContext"],
): Promise<PropertyResolve> {
  const propId = String(rawArgs.property_id || pageContext?.property_id || "").trim();
  const propName = String(rawArgs.property_name || "").trim();
  if (!propId && !propName) {
    return { ok: false, error: "Ange property_name eller property_id" };
  }
  if (propId) {
    const { data } = await supabase
      .from("properties")
      .select(PROPERTY_SELECT)
      .eq("organization_id", orgId)
      .eq("id", propId)
      .maybeSingle();
    if (!data) return { ok: false, error: "Fastighet hittades inte" };
    return { ok: true, property: data as ResolvedProperty };
  }

  const { data } = await supabase
    .from("properties")
    .select(PROPERTY_SELECT)
    .eq("organization_id", orgId)
    .ilike("name", `%${propName}%`)
    .order("name")
    .limit(8);

  const rows = (data || []) as ResolvedProperty[];
  if (!rows.length) return { ok: false, error: `Ingen fastighet matchade "${propName}"` };

  const exact = rows.filter(
    (p) => (p.name || "").toLowerCase() === propName.toLowerCase(),
  );
  if (exact.length === 1) return { ok: true, property: exact[0] };
  if (rows.length === 1) return { ok: true, property: rows[0] };

  const candidates = rows.map((p) => ({ id: p.id, name: p.name }));
  return {
    ok: false,
    error:
      `Flera fastigheter matchade "${propName}". Menade du: ` +
      candidates.map((c) => c.name).join(" | ") +
      `? Ange exakt namn eller property_id.`,
    candidates,
  };
}

async function resolveOneProperty(
  supabase: SupabaseClient,
  orgId: string,
  rawArgs: Record<string, unknown>,
  pageContext?: ToolContext["pageContext"],
): Promise<ResolvedProperty | null> {
  const r = await resolveOnePropertyDetailed(supabase, orgId, rawArgs, pageContext);
  return r.ok ? r.property : null;
}

/** Prefer detailed resolve and surface ambiguity to the model/user */
async function requireProperty(
  supabase: SupabaseClient,
  orgId: string,
  rawArgs: Record<string, unknown>,
  pageContext?: ToolContext["pageContext"],
): Promise<ResolvedProperty | { error: string; candidates?: Array<{ id: string; name: string }> }> {
  const r = await resolveOnePropertyDetailed(supabase, orgId, rawArgs, pageContext);
  if (r.ok) return r.property;
  return { error: r.error, candidates: r.candidates };
}

type ResolvedComponent = {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  property_id: string;
  property_name?: string | null;
};

async function resolveOneComponent(
  supabase: SupabaseClient,
  orgId: string,
  rawArgs: Record<string, unknown>,
  pageContext?: ToolContext["pageContext"],
): Promise<ResolvedComponent | null> {
  const compId = String(rawArgs.component_id || pageContext?.component_id || "").trim();
  const compName = String(rawArgs.component_name || "").trim();
  if (compId) {
    const { data } = await supabase
      .from("components")
      .select("id, name, type, status, property_id, properties!inner(organization_id, name)")
      .eq("id", compId)
      .eq("properties.organization_id", orgId)
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id as string,
      name: data.name as string,
      type: (data.type as string) ?? null,
      status: (data.status as string) ?? null,
      property_id: data.property_id as string,
      property_name:
        (data.properties as { name?: string } | null)?.name ?? null,
    };
  }
  if (!compName) return null;
  const prop = await resolveOneProperty(supabase, orgId, rawArgs, pageContext);
  let q = supabase
    .from("components")
    .select("id, name, type, status, property_id, properties!inner(organization_id, name)")
    .eq("properties.organization_id", orgId)
    .ilike("name", `%${compName}%`)
    .limit(1);
  if (prop) q = q.eq("property_id", prop.id);
  const { data } = await q.maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    name: data.name as string,
    type: (data.type as string) ?? null,
    status: (data.status as string) ?? null,
    property_id: data.property_id as string,
    property_name: (data.properties as { name?: string } | null)?.name ?? null,
  };
}

function generateProjectNumber(propertyNumber?: string | null): string {
  const base = (propertyNumber || "PRJ").replace(/\s+/g, "-").slice(0, 24);
  const year = new Date().getFullYear();
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `${base}-${year}-${suffix}`;
}

async function resolveOneProject(
  supabase: SupabaseClient,
  orgId: string,
  rawArgs: Record<string, unknown>,
  pageContext?: ToolContext["pageContext"],
): Promise<{
  id: string;
  name: string;
  project_number: string | null;
  property_id: string;
} | null> {
  const projectId = String(rawArgs.project_id || pageContext?.project_id || "").trim();
  const pnum = String(rawArgs.project_number || "").trim();
  const pname = String(rawArgs.name || rawArgs.project_name || "").trim();
  const prop = await resolveOneProperty(supabase, orgId, rawArgs, pageContext);

  if (projectId) {
    let q = supabase
      .from("projects")
      .select("id, name, project_number, property_id, properties!inner(organization_id)")
      .eq("id", projectId)
      .eq("properties.organization_id", orgId)
      .limit(1);
    const { data } = await q.maybeSingle();
    if (!data) return null;
    return {
      id: data.id as string,
      name: data.name as string,
      project_number: (data.project_number as string) ?? null,
      property_id: data.property_id as string,
    };
  }

  const { ids } = await resolvePropertyIds(
    supabase,
    orgId,
    prop?.name || String(rawArgs.property_name || "") || undefined,
  );
  if (!ids.length && !pnum && !pname) return null;

  let q = supabase
    .from("projects")
    .select("id, name, project_number, property_id")
    .limit(5);
  if (ids.length) q = q.in("property_id", ids);
  if (pnum) q = q.ilike("project_number", `%${pnum}%`);
  if (pname) q = q.ilike("name", `%${pname}%`);
  const { data } = await q;
  if (!data?.length) return null;
  const p = data[0];
  return {
    id: p.id as string,
    name: p.name as string,
    project_number: (p.project_number as string) ?? null,
    property_id: p.property_id as string,
  };
}

export async function executeJarvisTool(
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  // Prefer explicit tool args; fall back to UI page context for property scope
  const args = { ...rawArgs };
  if (!args.property_id && ctx.pageContext?.property_id) {
    args.property_id = ctx.pageContext.property_id;
  }
  if (!args.project_id && ctx.pageContext?.project_id) {
    args.project_id = ctx.pageContext.project_id;
  }

  // undo_* log themselves; batch logs children
  const shouldLog =
    name.startsWith("apply_") || name === "send_to_me";

  // Fas 5: viewer/reader cannot apply or batch writes
  const role = (ctx.memberRole || "").toLowerCase();
  if (
    (role === "viewer" || role === "reader") &&
    (name.startsWith("apply_") ||
      name === "batch_apply_actions" ||
      name === "send_to_me" ||
      name.startsWith("suggest_"))
  ) {
    return {
      error:
        "Din roll i organisationen är läsare — du kan fråga om data men inte skapa/ändra via Jarvis.",
      role_blocked: true,
    };
  }

  // C: rate limits — apply 30/min, send_to_me 10/hour
  if (name.startsWith("apply_") || name === "batch_apply_actions") {
    const rl = await checkRateLimit(ctx.userId, {
      endpoint: "jarvis-apply",
      maxRequests: 30,
      windowSeconds: 60,
    });
    if (!rl.allowed) {
      return {
        error:
          `För många skrivåtgärder. Vänta ${rl.retryAfterSeconds ?? 60} s och försök igen.`,
        rate_limited: true,
      };
    }
  }
  if (name === "send_to_me") {
    const rl = await checkRateLimit(ctx.userId, {
      endpoint: "jarvis-send-to-me",
      maxRequests: 10,
      windowSeconds: 3600,
    });
    if (!rl.allowed) {
      return {
        error:
          `E-postgräns nådd (max 10/timme). Vänta ${rl.retryAfterSeconds ?? 60} s.`,
        rate_limited: true,
      };
    }
  }

  // P2 idempotency: return prior successful result for same key
  const idemKey =
    String(args.idempotency_key || args.client_request_id || "").trim();
  if (idemKey && (name.startsWith("apply_") || name === "send_to_me")) {
    const hit = await findIdempotentHit(
      { supabase: ctx.supabase, orgId: ctx.orgId, userId: ctx.userId },
      idemKey,
    );
    if (hit?.result_full) {
      return {
        ...hit.result_full,
        idempotent_replay: true,
        action_log_id: hit.id,
        summary:
          String(
            (hit.result_full as { summary?: string }).summary ||
              "Idempotent: samma åtgärd redan utförd",
          ),
      };
    }
  }

  // Prevent nested batch from re-entering with batch tool name
  const result = await executeJarvisToolInner(name, args, ctx);

  if (shouldLog && name !== "batch_apply_actions") {
    // Fas 1B: read-after-write verification
    let verifiedResult = result;
    if (
      result &&
      typeof result === "object" &&
      (result as { applied?: boolean }).applied === true
    ) {
      verifiedResult = await attachReadAfterWrite(
        ctx.supabase,
        ctx.orgId,
        name,
        result as Record<string, unknown>,
      );
    }

    const logId = await logJarvisAction(ctx, name, args, verifiedResult);
    if (
      verifiedResult &&
      typeof verifiedResult === "object" &&
      !(verifiedResult as { idempotent_replay?: boolean }).idempotent_replay
    ) {
      const r = verifiedResult as Record<string, unknown>;
      if (logId) r.action_log_id = logId;
      if (r.applied === true && extractReversePayload(name, r)) {
        r.undoable = true;
        r.undo_window_ms = UNDO_WINDOW_MS;
        r.undo_until = undoDeadline(new Date().toISOString());
      }
    }
    return verifiedResult;
  }

  return result;
}

/** Fas 1B: re-read entity after apply so UI/model show DB truth */
async function attachReadAfterWrite(
  supabase: SupabaseClient,
  orgId: string,
  toolName: string,
  result: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    if (result.work_order && typeof result.work_order === "object") {
      const id = (result.work_order as { id?: string }).id;
      if (id) {
        const { data } = await supabase
          .from("work_orders")
          .select(WORK_ORDER_SELECT)
          .eq("id", id)
          .maybeSingle();
        if (data) {
          return {
            ...result,
            work_order: data,
            verified: true,
            verified_at: new Date().toISOString(),
          };
        }
      }
    }
    if (result.project && typeof result.project === "object") {
      const id = (result.project as { id?: string }).id;
      if (id) {
        const { data } = await supabase
          .from("projects")
          .select(PROJECT_SELECT)
          .eq("id", id)
          .maybeSingle();
        if (data) {
          return {
            ...result,
            project: data,
            verified: true,
            verified_at: new Date().toISOString(),
          };
        }
      }
    }
    if (result.property && typeof result.property === "object") {
      const id = (result.property as { id?: string }).id;
      if (id) {
        const { data } = await supabase
          .from("properties")
          .select(PROPERTY_SELECT)
          .eq("id", id)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (data) {
          return {
            ...result,
            property: data,
            verified: true,
            verified_at: new Date().toISOString(),
          };
        }
      }
    }
    if (result.component && typeof result.component === "object") {
      const id = (result.component as { id?: string }).id;
      if (id) {
        const { data } = await supabase
          .from("components")
          .select(
            "id, name, type, status, manufacturer, model, serial_number, property_id",
          )
          .eq("id", id)
          .maybeSingle();
        if (data) {
          return {
            ...result,
            component: data,
            verified: true,
            verified_at: new Date().toISOString(),
          };
        }
      }
    }
  } catch (e) {
    console.warn("[read-after-write]", e instanceof Error ? e.message : e);
  }
  return { ...result, verified: false };
}

async function executeJarvisToolInner(
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const { supabase, orgId, userId, userEmail, conversationId, pageContext } = ctx;
  const limit = Math.min(Math.max(Number(rawArgs.limit) || 20, 1), 50);

  try {
    switch (name) {
      case "list_properties": {
        let q = supabase
          .from("properties")
          .select(PROPERTY_SELECT)
          .eq("organization_id", orgId)
          .order("name")
          .limit(limit);
        const query = String(rawArgs.query || "").trim();
        if (query) {
          q = q.or(
            `name.ilike.%${query}%,address.ilike.%${query}%,invoice_address.ilike.%${query}%,property_number.ilike.%${query}%`,
          );
        }
        const { data, error } = await q;
        if (error) return { error: error.message };
        // Explicit nulls so model cannot invent "saknas" when field is empty string vs missing
        const properties = (data || []).map((p) => ({
          ...p,
          invoice_address: p.invoice_address ?? null,
          address: p.address ?? null,
          property_number: p.property_number ?? null,
          loa: p.loa ?? null,
          field_notes: {
            invoice_address:
              p.invoice_address?.trim()
                ? "finns"
                : "null i databasen (registrerad tom)",
          },
        }));
        return { count: properties.length, properties };
      }

      case "get_project": {
        const propName = String(rawArgs.property_name || "").trim();
        const projectId = String(rawArgs.project_id || "").trim();
        const { ids } = await resolvePropertyIds(
          supabase,
          orgId,
          propName || undefined,
        );
        if (!ids.length && !projectId) {
          return { error: "Inga fastigheter i organisationen" };
        }

        let q = supabase
          .from("projects")
          .select(`${PROJECT_SELECT}, property:properties(id, name, invoice_address, address)`)
          .limit(10);

        if (projectId) {
          q = q.eq("id", projectId);
        } else {
          q = q.in("property_id", ids);
        }

        const pnum = String(rawArgs.project_number || "").trim();
        const pname = String(rawArgs.name || "").trim();
        if (pnum) q = q.ilike("project_number", `%${pnum}%`);
        if (pname) q = q.ilike("name", `%${pname}%`);

        const { data, error } = await q;
        if (error) return { error: error.message };
        if (!data?.length) return { found: false, message: "Inget projekt matchade" };
        return {
          found: true,
          projects: data.map((p) => ({
            ...p,
            link_hint: `/projects/${p.id}`,
          })),
        };
      }

      case "list_work_orders": {
        const propName = String(rawArgs.property_name || "").trim();
        const propIdHint = String(rawArgs.property_id || "").trim();
        let ids: string[] = [];
        let names = new Map<string, string>();
        if (propIdHint) {
          const { data: one } = await supabase
            .from("properties")
            .select("id, name")
            .eq("organization_id", orgId)
            .eq("id", propIdHint)
            .maybeSingle();
          if (one) {
            ids = [one.id as string];
            names = new Map([[one.id as string, one.name as string]]);
          }
        } else {
          const resolved = await resolvePropertyIds(
            supabase,
            orgId,
            propName || undefined,
          );
          ids = resolved.ids;
          names = resolved.names;
        }
        if (!ids.length) return { count: 0, work_orders: [] };

        let q = supabase
          .from("work_orders")
          .select(WORK_ORDER_SELECT)
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
      case "suggest_todo":
      case "suggest_create_component":
      case "suggest_log_service":
      case "suggest_create_contact": {
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
          suggest_create_component: "create_component",
          suggest_log_service: "log_service",
          suggest_create_contact: "create_contact",
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
        if (
          name === "suggest_create_component" &&
          !String(rawArgs.name || "").trim()
        ) {
          return { error: "name krävs för komponent" };
        }
        if (
          name === "suggest_log_service" &&
          !String(rawArgs.action_type || "").trim()
        ) {
          return { error: "action_type krävs för service" };
        }
        if (
          name === "suggest_create_contact" &&
          !String(rawArgs.name || "").trim()
        ) {
          return { error: "name krävs för kontakt" };
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

        const prop = await resolveOneProperty(supabase, orgId, rawArgs, pageContext);
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
          summary: `E-post skickad till dig: ${subject}`,
          ui: { confirm: true, link: null, entity_type: "email" },
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
          const prop = await resolveOneProperty(supabase, orgId, rawArgs, pageContext);
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
        return withDeepLink(
          {
            applied: true,
            work_order: updated,
            previous_status: existing.status,
            property_name:
              (existing.properties as { name?: string } | null)?.name ?? null,
            summary: `Status: ${existing.status} → ${status} (${updated.action})`,
          },
          { entity_type: "work_order", entity_id: updated.id as string, path: "/work-orders" },
        );
      }

      case "apply_project_status": {
        const rawStatus = String(rawArgs.status || "").trim();
        const archive =
          rawStatus === "archived" || rawStatus === "avslutat";
        const status = rawStatus === "archived" ? "avslutat" : rawStatus;
        if (!PROJECT_STATUSES.includes(status as (typeof PROJECT_STATUSES)[number])) {
          return {
            error: `Ogiltig status. Tillåtna: ${PROJECT_STATUSES.join(", ")}, archived`,
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
          .select("id, name, status, property_id, is_archived")
          .eq("id", projectId)
          .in("property_id", ids)
          .maybeSingle();
        if (!existing) {
          return { error: "Projekt hittades inte i din organisation" };
        }

        const patch: Record<string, unknown> = { status };
        if (archive) patch.is_archived = true;
        else if (existing.is_archived) patch.is_archived = false;

        const { data: updated, error } = await supabase
          .from("projects")
          .update(patch)
          .eq("id", projectId)
          .select("id, name, project_number, status, is_archived")
          .single();
        if (error) return { error: error.message };
        return withDeepLink(
          {
            applied: true,
            project: updated,
            previous_status: existing.status,
            previous_is_archived: existing.is_archived ?? false,
            summary: `Projekt ${updated.project_number || updated.name}: ${existing.status} → ${status}${archive ? " (arkiverat)" : ""}`,
          },
          {
            entity_type: "project",
            entity_id: updated.id as string,
            path: `/projects/${updated.id}`,
          },
        );
      }

      case "apply_update_invoice_address": {
        const inv = String(rawArgs.invoice_address || "").trim();
        if (!inv) return { error: "invoice_address krävs" };
        const propRes = await requireProperty(supabase, orgId, rawArgs, pageContext);
        if ("error" in propRes) return propRes;
        const prop = propRes;
        const { data: updated, error } = await supabase
          .from("properties")
          .update({ invoice_address: inv })
          .eq("id", prop.id)
          .eq("organization_id", orgId)
          .select("id, name, invoice_address, address, property_number")
          .single();
        if (error) return { error: error.message };
        return withDeepLink(
          {
            applied: true,
            property: updated,
            previous_invoice_address: prop.invoice_address ?? null,
            summary: `Fakturaadress uppdaterad för ${updated.name}`,
          },
          {
            entity_type: "property",
            entity_id: updated.id as string,
            path: `/property/${updated.id}`,
          },
        );
      }

      case "apply_create_work_order": {
        const actionText = String(rawArgs.action || "").trim();
        if (!actionText) return { error: "action krävs" };
        const propRes = await requireProperty(supabase, orgId, rawArgs, pageContext);
        if ("error" in propRes) return propRes;
        const prop = propRes;
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
        return withDeepLink(
          {
            applied: true,
            work_order: wo,
            property_name: prop.name,
            summary: `Arbetsorder skapad: ${wo.action} (${prop.name})`,
          },
          { entity_type: "work_order", entity_id: wo.id as string, path: "/work-orders" },
        );
      }

      case "apply_create_project": {
        const pname = String(rawArgs.name || "").trim();
        if (!pname) return { error: "name krävs" };
        const prop = await resolveOneProperty(supabase, orgId, rawArgs, pageContext);
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
        return withDeepLink(
          {
            applied: true,
            project,
            property_name: prop.name,
            summary: `Projekt ${project.project_number}: ${project.name}`,
          },
          {
            entity_type: "project",
            entity_id: project.id as string,
            path: `/projects/${project.id}`,
          },
        );
      }

      case "apply_property_note": {
        const content = String(rawArgs.content || "").trim();
        if (!content) return { error: "content krävs" };
        const prop = await resolveOneProperty(supabase, orgId, rawArgs, pageContext);
        if (!prop) return { error: "Ange fastighet" };
        const { data: note, error } = await supabase
          .from("property_notes")
          .insert({ property_id: prop.id, content })
          .select("id, property_id, content, created_at")
          .single();
        if (error) return { error: error.message };
        return withDeepLink(
          {
            applied: true,
            note: { ...note, content: content.slice(0, 200) },
            property_name: prop.name,
            summary: `Anteckning sparad på ${prop.name}`,
          },
          {
            entity_type: "property",
            entity_id: prop.id,
            path: `/property/${prop.id}`,
          },
        );
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
          .select(PROPERTY_SELECT)
          .single();
        if (error) return { error: error.message };
        return withDeepLink(
          {
            applied: true,
            property: created,
            summary: `Fastighet skapad: ${created.name}`,
          },
          {
            entity_type: "property",
            entity_id: created.id as string,
            path: `/property/${created.id}`,
          },
        );
      }

      case "apply_update_property": {
        const prop = await resolveOneProperty(supabase, orgId, rawArgs, pageContext);
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
        // Snapshot previous values for undo
        const previous: Record<string, unknown> = {};
        for (const key of Object.keys(patch)) {
          previous[key] = (prop as Record<string, unknown>)[key] ?? null;
        }
        const { data: updated, error } = await supabase
          .from("properties")
          .update(patch)
          .eq("id", prop.id)
          .eq("organization_id", orgId)
          .select(PROPERTY_SELECT)
          .single();
        if (error) return { error: error.message };
        return withDeepLink(
          {
            applied: true,
            property: updated,
            previous,
            summary: `Fastighet uppdaterad: ${updated.name}`,
          },
          {
            entity_type: "property",
            entity_id: updated.id as string,
            path: `/property/${updated.id}`,
          },
        );
      }

      case "get_property_overview": {
        const propName = String(rawArgs.property_name || "").trim();
        const propIdArg = String(rawArgs.property_id || pageContext?.property_id || "").trim();
        if (!propName && !propIdArg) {
          return { error: "property_name eller property_id krävs" };
        }
        let pq = supabase
          .from("properties")
          .select(PROPERTY_SELECT)
          .eq("organization_id", orgId)
          .limit(1);
        if (propIdArg) pq = pq.eq("id", propIdArg);
        else pq = pq.ilike("name", `%${propName}%`);
        const { data: prop, error: pErr } = await pq.maybeSingle();
        if (pErr) return { error: pErr.message };
        if (!prop) return { error: "Fastighet hittades inte" };
        const pid = prop.id as string;

        const [comps, wos, todos, notes, docs, plan, contacts] = await Promise.all([
          supabase
            .from("components")
            .select("id, name, type, status, installation_year, manufacturer, model, serial_number")
            .eq("property_id", pid)
            .neq("status", "decommissioned")
            .order("name")
            .limit(120),
          supabase
            .from("work_orders")
            .select(WORK_ORDER_SELECT)
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
          supabase
            .from("property_contacts")
            .select("id, name, role, company, email, phone")
            .eq("property_id", pid)
            .limit(20),
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

        const inv = (prop.invoice_address as string | null)?.trim() || null;

        return {
          property: {
            ...prop,
            invoice_address: inv,
            // Explicit presence flags — never invent values
            fields_present: {
              invoice_address: Boolean(inv),
              address: Boolean((prop.address as string | null)?.trim()),
              property_number: Boolean(
                (prop.property_number as string | null)?.trim(),
              ),
              loa: Boolean((prop.loa as string | null)?.trim()),
            },
          },
          link_hint: `/property/${pid}`,
          counts: {
            components: components.length,
            open_work_orders: (wos.data ?? []).length,
            open_todos: (todos.data ?? []).length,
            notes: (notes.data ?? []).length,
            documents: (docs.data ?? []).length,
            high_risk: highRisk.length,
            contacts: (contacts.data ?? []).length,
          },
          components: components.slice(0, 60),
          open_work_orders: wos.data ?? [],
          open_todos: todos.data ?? [],
          notes: (notes.data ?? []).map((n) => ({
            excerpt: String(n.content || "").slice(0, 300),
            created_at: n.created_at,
          })),
          documents: docs.data ?? [],
          contacts: contacts.data ?? [],
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

      case "list_contacts": {
        const prop = await resolveOneProperty(supabase, orgId, rawArgs, pageContext);
        if (!prop) return { error: "Ange property_name eller property_id" };
        const { data, error } = await supabase
          .from("property_contacts")
          .select("id, name, role, company, email, phone, property_id, created_at")
          .eq("property_id", prop.id)
          .order("name")
          .limit(limit);
        if (error) return { error: error.message };
        return {
          count: data?.length || 0,
          property_name: prop.name,
          contacts: data || [],
          link_hint: `/property/${prop.id}`,
        };
      }

      case "get_daily_briefing": {
        const stats = await buildDailyBriefing(supabase, orgId);
        return {
          briefing: stats,
          plain_text: formatBriefingPlain(stats),
          tip: "Använd send_to_me med subject 'Daglig briefing' och body=plain_text om användaren vill ha mejl.",
        };
      }

      case "list_property_documents": {
        const prop = await resolveOneProperty(supabase, orgId, rawArgs, pageContext);
        if (!prop) return { error: "Ange property_name eller property_id" };
        const { data: docs, error } = await supabase
          .from("property_documents")
          .select("id, name, mime_type, file_size, version, is_latest, created_at, file_url")
          .eq("property_id", prop.id)
          .eq("is_latest", true)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return { error: error.message };
        const ids = (docs || []).map((d) => d.id as string);
        let indexed = new Set<string>();
        if (ids.length) {
          const { data: emb } = await supabase
            .from("embeddings")
            .select("source_id")
            .eq("source_table", "property_documents")
            .in("source_id", ids);
          indexed = new Set((emb || []).map((e) => e.source_id as string));
        }
        return {
          property_name: prop.name,
          count: docs?.length || 0,
          indexed_count: indexed.size,
          documents: (docs || []).map((d) => ({
            id: d.id,
            name: d.name,
            mime_type: d.mime_type,
            file_size: d.file_size,
            version: d.version,
            created_at: d.created_at,
            ai_indexed: indexed.has(d.id as string),
            link_hint: `/property/${prop.id}`,
          })),
          tip:
            "Dokument laddas upp under Fastighet → Dokument (zip/mapp stöds). Index sker via embedding-kö. Sök innehåll med search_property_documents.",
        };
      }

      case "list_document_ingest_batches": {
        const prop = await resolveOneProperty(supabase, orgId, rawArgs, pageContext);
        if (!prop) return { error: "Ange property_name eller property_id" };
        const { data: batches, error } = await supabase
          .from("document_ingest_batches")
          .select(
            "id, source, label, status, files_total, files_ok, files_failed, created_at, finished_at, error_summary",
          )
          .eq("property_id", prop.id)
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(Math.min(limit, 15));
        if (error) {
          return {
            error: error.message,
            tip: "Kör migrering 20260811220000_document_ingest_batches om tabellen saknas.",
          };
        }
        return {
          property_name: prop.name,
          count: batches?.length || 0,
          batches: batches || [],
        };
      }

      case "apply_create_component": {
        const cname = String(rawArgs.name || "").trim();
        if (!cname) return { error: "name krävs" };
        const prop = await resolveOneProperty(supabase, orgId, rawArgs, pageContext);
        if (!prop) {
          return { error: "Ange fastighet (property_name/property_id)" };
        }
        const typeCode =
          normalizeComponentType(String(rawArgs.type || "")) || "SC4.7";
        const statusRaw = String(rawArgs.status || "active").trim();
        const status = COMPONENT_STATUSES.includes(
          statusRaw as (typeof COMPONENT_STATUSES)[number],
        )
          ? statusRaw
          : "active";
        const insert: Record<string, unknown> = {
          property_id: prop.id,
          name: cname,
          type: typeCode,
          status,
          manufacturer: (rawArgs.manufacturer as string) || null,
          model: (rawArgs.model as string) || null,
          serial_number: (rawArgs.serial_number as string) || null,
          notes: (rawArgs.notes as string) || null,
          supplier: (rawArgs.supplier as string) || null,
        };
        if (rawArgs.installation_year != null) {
          insert.installation_year = Number(rawArgs.installation_year);
        }
        const { data: created, error } = await supabase
          .from("components")
          .insert(insert)
          .select(
            "id, name, type, status, manufacturer, model, serial_number, installation_year, property_id",
          )
          .single();
        if (error) return { error: error.message };
        return withDeepLink(
          {
            applied: true,
            component: created,
            property_name: prop.name,
            summary: `Komponent skapad: ${created.name} (${created.type}) på ${prop.name}`,
          },
          {
            entity_type: "component",
            entity_id: created.id as string,
            path: `/components/${created.id}`,
          },
        );
      }

      case "apply_update_component": {
        const comp = await resolveOneComponent(
          supabase,
          orgId,
          rawArgs,
          pageContext,
        );
        if (!comp) {
          return {
            error:
              "Komponent hittades inte — ange component_id eller component_name (+ fastighet)",
          };
        }
        const patch: Record<string, unknown> = {};
        for (const key of [
          "name",
          "manufacturer",
          "model",
          "serial_number",
          "notes",
          "supplier",
          "next_service_date",
        ] as const) {
          if (rawArgs[key] != null && String(rawArgs[key]).trim() !== "") {
            patch[key] = rawArgs[key];
          }
        }
        if (rawArgs.type != null) {
          const t = normalizeComponentType(String(rawArgs.type));
          if (t) patch.type = t;
        }
        if (rawArgs.status != null) {
          const s = String(rawArgs.status).trim();
          if (COMPONENT_STATUSES.includes(s as (typeof COMPONENT_STATUSES)[number])) {
            patch.status = s;
          }
        }
        if (rawArgs.installation_year != null) {
          patch.installation_year = Number(rawArgs.installation_year);
        }
        if (!Object.keys(patch).length) {
          return { error: "Inga fält att uppdatera" };
        }
        // Load full row for reverse snapshot
        const { data: before } = await supabase
          .from("components")
          .select(
            "id, name, type, status, manufacturer, model, serial_number, installation_year, notes, supplier, next_service_date",
          )
          .eq("id", comp.id)
          .maybeSingle();
        const previous: Record<string, unknown> = {};
        for (const key of Object.keys(patch)) {
          previous[key] = (before as Record<string, unknown> | null)?.[key] ??
            (comp as unknown as Record<string, unknown>)[key] ??
            null;
        }
        const { data: updated, error } = await supabase
          .from("components")
          .update(patch)
          .eq("id", comp.id)
          .select(
            "id, name, type, status, manufacturer, model, serial_number, installation_year, property_id, next_service_date",
          )
          .single();
        if (error) return { error: error.message };
        return withDeepLink(
          {
            applied: true,
            component: updated,
            previous,
            summary: `Komponent uppdaterad: ${updated.name}`,
          },
          {
            entity_type: "component",
            entity_id: updated.id as string,
            path: `/components/${updated.id}`,
          },
        );
      }

      case "apply_log_service": {
        const actionType = String(rawArgs.action_type || "").trim();
        if (!actionType) return { error: "action_type krävs" };
        const comp = await resolveOneComponent(
          supabase,
          orgId,
          rawArgs,
          pageContext,
        );
        if (!comp) {
          return {
            error:
              "Komponent krävs — ange component_name/component_id (och fastighet vid behov)",
          };
        }
        const performed =
          String(rawArgs.performed_date || "").trim().slice(0, 10) ||
          new Date().toISOString().slice(0, 10);
        const costRaw = rawArgs.cost;
        const cost =
          costRaw != null && !Number.isNaN(Number(costRaw))
            ? Number(costRaw)
            : null;
        const { data: service, error } = await supabase
          .from("maintenance_history")
          .insert({
            component_id: comp.id,
            action_type: actionType,
            performed_date: performed,
            cost,
            supplier: (rawArgs.supplier as string) || null,
            notes:
              (rawArgs.notes as string) ||
              "Loggad via Jarvis (direkt på begäran)",
            category: (rawArgs.category as string) || null,
            is_warranty: rawArgs.is_warranty === true,
          })
          .select(
            "id, component_id, action_type, performed_date, cost, supplier, notes, category",
          )
          .single();
        if (error) return { error: error.message };
        return withDeepLink(
          {
            applied: true,
            service,
            component_name: comp.name,
            property_name: comp.property_name,
            summary: `Service loggad: ${actionType} på ${comp.name} (${performed})`,
          },
          {
            entity_type: "component",
            entity_id: comp.id,
            path: `/components/${comp.id}`,
          },
        );
      }

      case "apply_create_contact": {
        const cname = String(rawArgs.name || "").trim();
        if (!cname) return { error: "name krävs" };
        const prop = await resolveOneProperty(supabase, orgId, rawArgs, pageContext);
        if (!prop) return { error: "Ange fastighet för kontakten" };
        const { data: contact, error } = await supabase
          .from("property_contacts")
          .insert({
            property_id: prop.id,
            name: cname,
            role: (rawArgs.role as string) || null,
            company: (rawArgs.company as string) || null,
            email: (rawArgs.email as string) || null,
            phone: (rawArgs.phone as string) || null,
          })
          .select("id, name, role, company, email, phone, property_id")
          .single();
        if (error) return { error: error.message };
        return withDeepLink(
          {
            applied: true,
            contact,
            property_name: prop.name,
            summary: `Kontakt tillagd: ${contact.name} på ${prop.name}`,
          },
          {
            entity_type: "property",
            entity_id: prop.id,
            path: `/property/${prop.id}`,
          },
        );
      }

      case "apply_update_contact": {
        let contactId = String(rawArgs.contact_id || "").trim();
        if (!contactId) {
          const prop = await resolveOneProperty(
            supabase,
            orgId,
            rawArgs,
            pageContext,
          );
          const cname = String(rawArgs.contact_name || rawArgs.name || "").trim();
          if (!cname) {
            return { error: "contact_id eller contact_name krävs" };
          }
          let q = supabase
            .from("property_contacts")
            .select("id, property_id, properties!inner(organization_id)")
            .eq("properties.organization_id", orgId)
            .ilike("name", `%${cname}%`)
            .limit(1);
          if (prop) q = q.eq("property_id", prop.id);
          const { data: found } = await q.maybeSingle();
          if (!found) return { error: "Kontakt hittades inte" };
          contactId = found.id as string;
        }

        const { data: existing } = await supabase
          .from("property_contacts")
          .select(
            "id, name, role, company, email, phone, property_id, properties!inner(organization_id, name)",
          )
          .eq("id", contactId)
          .eq("properties.organization_id", orgId)
          .maybeSingle();
        if (!existing) {
          return { error: "Kontakt tillhör inte din organisation" };
        }

        const patch: Record<string, unknown> = {};
        for (const key of ["name", "role", "company", "email", "phone"] as const) {
          if (rawArgs[key] != null && String(rawArgs[key]).trim() !== "") {
            patch[key] = rawArgs[key];
          }
        }
        if (!Object.keys(patch).length) {
          return { error: "Inga fält att uppdatera" };
        }
        const previous: Record<string, unknown> = {};
        for (const key of Object.keys(patch)) {
          previous[key] = (existing as Record<string, unknown>)[key] ?? null;
        }
        const { data: updated, error } = await supabase
          .from("property_contacts")
          .update(patch)
          .eq("id", contactId)
          .select("id, name, role, company, email, phone, property_id")
          .single();
        if (error) return { error: error.message };
        const propId = updated.property_id as string;
        return withDeepLink(
          {
            applied: true,
            contact: updated,
            previous,
            summary: `Kontakt uppdaterad: ${updated.name}`,
          },
          {
            entity_type: "property",
            entity_id: propId,
            path: `/property/${propId}`,
          },
        );
      }

      case "undo_last_action": {
        return undoLastAction({ supabase, orgId, userId });
      }

      case "undo_jarvis_action": {
        const id = String(rawArgs.action_log_id || "").trim();
        if (!id) return { error: "action_log_id krävs" };
        return undoActionById({ supabase, orgId, userId }, id);
      }

      case "list_recent_jarvis_actions": {
        const lim = Math.min(Math.max(Number(rawArgs.limit) || 10, 1), 20);
        const { data, error } = await supabase
          .from("jarvis_action_log")
          .select(
            "id, tool_name, success, entity_type, entity_id, link_hint, created_at, undone_at, reverse_payload, result_summary",
          )
          .eq("organization_id", orgId)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(lim);
        if (error) return { error: error.message };
        const now = Date.now();
        return {
          count: data?.length || 0,
          undo_window_ms: UNDO_WINDOW_MS,
          actions: (data || []).map((a) => {
            const created = a.created_at as string;
            const canUndo =
              a.success &&
              !a.undone_at &&
              a.reverse_payload != null &&
              now - new Date(created).getTime() <= UNDO_WINDOW_MS;
            return {
              action_log_id: a.id,
              tool: a.tool_name,
              success: a.success,
              entity_type: a.entity_type,
              entity_id: a.entity_id,
              link: a.link_hint,
              created_at: created,
              undone: Boolean(a.undone_at),
              undoable: canUndo,
              undo_until: canUndo ? undoDeadline(created) : null,
              summary: (a.result_summary as { summary?: string } | null)?.summary ||
                null,
            };
          }),
        };
      }

      case "batch_apply_actions": {
        const rawList = Array.isArray(rawArgs.actions) ? rawArgs.actions : [];
        if (!rawList.length) {
          return { error: "actions[] krävs (minst en apply_*)" };
        }
        const max = BATCH_MAX_ACTIONS;
        if (rawList.length > max) {
          return {
            error: `Max ${max} åtgärder per batch (fick ${rawList.length})`,
          };
        }
        const stopOnError = rawArgs.stop_on_error !== false;
        const results: Array<Record<string, unknown>> = [];
        let ok = 0;
        let failed = 0;

        for (let i = 0; i < rawList.length; i++) {
          const item = rawList[i] as Record<string, unknown>;
          const tool = String(item.tool || item.name || "").trim();
          if (!BATCHABLE_TOOLS.has(tool)) {
            results.push({
              index: i,
              tool,
              error: `Verktyg tillåts inte i batch: ${tool}`,
            });
            failed++;
            if (stopOnError) break;
            continue;
          }
          const childArgs = {
            ...((item.args && typeof item.args === "object"
              ? item.args
              : item) as Record<string, unknown>),
          };
          delete childArgs.tool;
          delete childArgs.name;
          delete childArgs.args;
          if (item.idempotency_key) {
            childArgs.idempotency_key = item.idempotency_key;
          } else if (!childArgs.idempotency_key) {
            // Stable default key for batch step (reduces double-fire risk)
            childArgs.idempotency_key =
              `batch:${ctx.conversationId || "x"}:${i}:${tool}:${
                JSON.stringify(childArgs).slice(0, 80)
              }`;
          }

          // Re-enter through outer executeJarvisTool for logging + idempotency
          const childResult = await executeJarvisTool(tool, childArgs, ctx);
          const cr = (childResult && typeof childResult === "object"
            ? childResult
            : { result: childResult }) as Record<string, unknown>;
          const success = !cr.error && (cr.applied === true || cr.sent === true);
          if (success) ok++;
          else failed++;
          results.push({
            index: i,
            tool,
            success,
            summary: cr.summary || cr.error || null,
            action_log_id: cr.action_log_id || null,
            link: cr.link_hint || null,
            entity_type: (cr.ui as { entity_type?: string } | undefined)?.entity_type ||
              null,
            entity_id: (cr.ui as { entity_id?: string } | undefined)?.entity_id ||
              null,
            undoable: cr.undoable === true,
            error: cr.error || null,
          });
          if (!success && stopOnError) break;
        }

        return {
          applied: failed === 0 && ok > 0,
          batch: true,
          total: results.length,
          ok,
          failed,
          stop_on_error: stopOnError,
          results,
          summary: `Batch: ${ok} lyckades, ${failed} misslyckades av ${results.length}`,
        };
      }

      case "apply_create_todo": {
        const title = String(rawArgs.title || "").trim();
        if (!title) return { error: "title krävs" };
        const prop = await resolveOneProperty(supabase, orgId, rawArgs, pageContext);
        if (!prop) return { error: "Ange fastighet för todo" };
        const { data: todo, error } = await supabase
          .from("property_todos")
          .insert({
            property_id: prop.id,
            title,
            description: (rawArgs.description as string) || null,
            due_date: (rawArgs.due_date as string) || null,
            priority: String(rawArgs.priority || "medium"),
            completed: false,
          })
          .select("id, title, priority, due_date, completed, property_id")
          .single();
        if (error) return { error: error.message };
        return withDeepLink(
          {
            applied: true,
            todo,
            property_name: prop.name,
            summary: `Todo skapad: ${todo.title} (${prop.name})`,
          },
          {
            entity_type: "property",
            entity_id: prop.id,
            path: `/property/${prop.id}`,
          },
        );
      }

      case "list_todos": {
        const prop = await resolveOneProperty(supabase, orgId, rawArgs, pageContext);
        if (!prop) return { error: "Ange fastighet" };
        let q = supabase
          .from("property_todos")
          .select("id, title, priority, due_date, completed, property_id, created_at")
          .eq("property_id", prop.id)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (rawArgs.include_completed !== true) {
          q = q.eq("completed", false);
        }
        const { data, error } = await q;
        if (error) return { error: error.message };
        return {
          property_name: prop.name,
          count: data?.length || 0,
          todos: data || [],
          link_hint: `/property/${prop.id}`,
        };
      }

      case "apply_complete_todo": {
        const wantCompleted = rawArgs.completed !== false;
        let todoId = String(rawArgs.todo_id || "").trim();
        const prop = await resolveOneProperty(supabase, orgId, rawArgs, pageContext);
        if (!todoId) {
          const title = String(rawArgs.title || "").trim();
          if (!title) return { error: "todo_id eller title krävs" };
          let q = supabase
            .from("property_todos")
            .select("id, title, completed, property_id, properties!inner(organization_id)")
            .eq("properties.organization_id", orgId)
            .ilike("title", `%${title}%`)
            .limit(1);
          if (prop) q = q.eq("property_id", prop.id);
          const { data: found } = await q.maybeSingle();
          if (!found) return { error: "Todo hittades inte" };
          todoId = found.id as string;
        }
        const { data: existing } = await supabase
          .from("property_todos")
          .select("id, title, completed, property_id, properties!inner(organization_id)")
          .eq("id", todoId)
          .eq("properties.organization_id", orgId)
          .maybeSingle();
        if (!existing) return { error: "Todo tillhör inte organisationen" };
        const { data: updated, error } = await supabase
          .from("property_todos")
          .update({ completed: wantCompleted })
          .eq("id", todoId)
          .select("id, title, completed, property_id")
          .single();
        if (error) return { error: error.message };
        return withDeepLink(
          {
            applied: true,
            todo: updated,
            previous_completed: existing.completed,
            summary: wantCompleted
              ? `Todo klar: ${updated.title}`
              : `Todo öppnad igen: ${updated.title}`,
          },
          {
            entity_type: "property",
            entity_id: updated.property_id as string,
            path: `/property/${updated.property_id}`,
          },
        );
      }

      case "apply_add_project_cost": {
        const desc = String(rawArgs.description || "").trim();
        const amount = Number(rawArgs.amount);
        if (!desc) return { error: "description krävs" };
        if (Number.isNaN(amount)) return { error: "amount krävs (nummer)" };
        const project = await resolveOneProject(supabase, orgId, rawArgs, pageContext);
        if (!project) {
          return { error: "Projekt hittades inte (project_id/number/name + fastighet)" };
        }
        const costDate =
          String(rawArgs.cost_date || "").trim().slice(0, 10) ||
          new Date().toISOString().slice(0, 10);
        const { data: cost, error } = await supabase
          .from("project_cost_items")
          .insert({
            project_id: project.id,
            description: desc,
            amount,
            cost_date: costDate,
            category: (rawArgs.category as string) || null,
            actor: (rawArgs.actor as string) || null,
            created_by: userId,
          })
          .select("id, description, amount, cost_date, category, project_id")
          .single();
        if (error) return { error: error.message };
        return withDeepLink(
          {
            applied: true,
            cost_item: cost,
            project_name: project.name,
            summary: `Kostnad ${amount} kr: ${desc} (${project.name})`,
          },
          {
            entity_type: "project",
            entity_id: project.id,
            path: `/projects/${project.id}`,
          },
        );
      }

      case "apply_add_budget_item": {
        const desc = String(rawArgs.description || "").trim();
        const budgeted = Number(rawArgs.budgeted_amount);
        if (!desc) return { error: "description krävs" };
        if (Number.isNaN(budgeted)) return { error: "budgeted_amount krävs" };
        const project = await resolveOneProject(supabase, orgId, rawArgs, pageContext);
        if (!project) return { error: "Projekt hittades inte" };
        const forecastRaw = rawArgs.forecasted_amount;
        const { data: item, error } = await supabase
          .from("project_budget_items")
          .insert({
            project_id: project.id,
            description: desc,
            budgeted_amount: budgeted,
            forecasted_amount:
              forecastRaw != null && !Number.isNaN(Number(forecastRaw))
                ? Number(forecastRaw)
                : null,
            category: (rawArgs.category as string) || null,
          })
          .select("id, description, budgeted_amount, forecasted_amount, category, project_id")
          .single();
        if (error) return { error: error.message };
        return withDeepLink(
          {
            applied: true,
            budget_item: item,
            project_name: project.name,
            summary: `Budgetrad ${budgeted} kr: ${desc} (${project.name})`,
          },
          {
            entity_type: "project",
            entity_id: project.id,
            path: `/projects/${project.id}`,
          },
        );
      }

      case "list_project_costs": {
        const project = await resolveOneProject(supabase, orgId, rawArgs, pageContext);
        if (!project) return { error: "Projekt hittades inte" };
        const [costs, budget] = await Promise.all([
          supabase
            .from("project_cost_items")
            .select("id, description, amount, cost_date, category, actor")
            .eq("project_id", project.id)
            .order("cost_date", { ascending: false })
            .limit(50),
          supabase
            .from("project_budget_items")
            .select("id, description, budgeted_amount, forecasted_amount, category")
            .eq("project_id", project.id)
            .limit(50),
        ]);
        if (costs.error) return { error: costs.error.message };
        if (budget.error) return { error: budget.error.message };
        const costSum = (costs.data || []).reduce(
          (s, c) => s + (Number(c.amount) || 0),
          0,
        );
        const budgetSum = (budget.data || []).reduce(
          (s, b) => s + (Number(b.budgeted_amount) || 0),
          0,
        );
        return {
          project: {
            id: project.id,
            name: project.name,
            project_number: project.project_number,
          },
          totals: { costs: costSum, budgeted: budgetSum },
          costs: costs.data || [],
          budget_items: budget.data || [],
          link_hint: `/projects/${project.id}`,
        };
      }

      case "apply_complete_checklist_item": {
        const wantCompleted = rawArgs.completed !== false;
        let itemId = String(rawArgs.checklist_item_id || "").trim();
        const project = await resolveOneProject(supabase, orgId, rawArgs, pageContext);
        if (!itemId) {
          const title = String(rawArgs.title || "").trim();
          if (!title || !project) {
            return { error: "checklist_item_id eller title+projekt krävs" };
          }
          const { data: found } = await supabase
            .from("project_checklist_items")
            .select("id, title, completed, project_id")
            .eq("project_id", project.id)
            .ilike("title", `%${title}%`)
            .limit(1)
            .maybeSingle();
          if (!found) return { error: "Checklistepunkt hittades inte" };
          itemId = found.id as string;
        }
        // Org scope via project
        const { data: existing } = await supabase
          .from("project_checklist_items")
          .select(
            "id, title, completed, project_id, projects!inner(property_id, properties!inner(organization_id))",
          )
          .eq("id", itemId)
          .eq("projects.properties.organization_id", orgId)
          .maybeSingle();
        if (!existing) return { error: "Checklistepunkt tillhör inte organisationen" };

        const patch: Record<string, unknown> = {
          completed: wantCompleted,
          completed_at: wantCompleted ? new Date().toISOString() : null,
          completed_by: wantCompleted ? userId : null,
        };
        const { data: updated, error } = await supabase
          .from("project_checklist_items")
          .update(patch)
          .eq("id", itemId)
          .select("id, title, completed, project_id")
          .single();
        if (error) return { error: error.message };
        return withDeepLink(
          {
            applied: true,
            checklist_item: updated,
            previous_completed: existing.completed,
            summary: wantCompleted
              ? `Checklista klar: ${updated.title}`
              : `Checklista öppnad: ${updated.title}`,
          },
          {
            entity_type: "project",
            entity_id: updated.project_id as string,
            path: `/projects/${updated.project_id}`,
          },
        );
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
