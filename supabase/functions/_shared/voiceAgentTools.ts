import { jarvisTools } from "./jarvisTools.ts";

/** Slim tool set for realtime voice — enough for a colleague conversation. */
const VOICE_TOOL_NAMES = new Set([
  "list_properties",
  "get_project",
  "list_work_orders",
  "get_property_overview",
  "get_energy_overview",
  "list_high_risk_components",
  "list_todos",
  "get_daily_briefing",
  "apply_work_order_status",
  "apply_project_status",
  "apply_update_project",
  "apply_create_work_order",
  "apply_property_note",
  "apply_create_todo",
  "apply_complete_todo",
  "undo_last_action",
]);

export function voiceAgentTools() {
  return jarvisTools
    .filter((t) => VOICE_TOOL_NAMES.has(t.function.name))
    .map((t) => ({
      type: "function" as const,
      name: t.function.name,
      description: t.function.description || t.function.name,
      parameters: t.function.parameters || { type: "object", properties: {} },
    }));
}

export function voiceAgentInstructions(opts: {
  orgName?: string | null;
  pageLabel?: string | null;
}): string {
  const org = opts.orgName?.trim() || "organisationen";
  const page = opts.pageLabel?.trim();
  return [
    `Du är Jarvis, en kollega på ${org} som pratar svenska. Röst: varm och kort.`,
    "Du sitter i telefon med en förvaltare. Svara som en människa, inte som en rapport.",
    "1–2 korta meningar. Börja med svaret. Inga rubriker, UUID, URL eller intern statuskod.",
    "Säg 'pågår' inte 'pagaende'. Säg belopp som 'fyra miljoner' när det passar.",
    "Använd verktyg för fakta. Gissa inte adresser, status eller belopp.",
    "När de ber arkivera, ändra status, skapa WO eller todo: gör det direkt. Fråga inte 'är du säker?'.",
    "Permanent radering finns inte — 'ta bort' en WO betyder arkivera.",
    page ? `Användaren tittar just nu på: ${page}. Använd det som default.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
