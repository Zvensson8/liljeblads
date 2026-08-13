/**
 * Jarvis P2: reverse payloads, undo window, idempotency helpers.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const UNDO_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
export const BATCH_MAX_ACTIONS = 10;

export type ReversePayload =
  | {
      kind: "update";
      table: string;
      id: string;
      fields: Record<string, unknown>;
      /** optional org guard via properties join */
      property_id?: string;
    }
  | {
      kind: "delete";
      table: string;
      id: string;
      property_id?: string;
    };

export type UndoContext = {
  supabase: SupabaseClient;
  orgId: string;
  userId: string;
};

const ALLOWED_TABLES = new Set([
  "work_orders",
  "projects",
  "properties",
  "property_notes",
  "components",
  "maintenance_history",
  "property_contacts",
  "property_todos",
  "project_cost_items",
  "project_budget_items",
  "project_checklist_items",
]);

/** Build reverse payload from a successful apply_* result. */
export function extractReversePayload(
  toolName: string,
  result: Record<string, unknown>,
): ReversePayload | null {
  if (result.error || result.applied !== true) return null;

  switch (toolName) {
    case "apply_work_order_status": {
      const wo = result.work_order as { id?: string } | undefined;
      const prev = result.previous_status;
      if (!wo?.id || prev == null) return null;
      return {
        kind: "update",
        table: "work_orders",
        id: String(wo.id),
        fields: { status: prev },
      };
    }
    case "apply_project_status": {
      const p = result.project as { id?: string } | undefined;
      const prev = result.previous_status;
      if (!p?.id || prev == null) return null;
      const fields: Record<string, unknown> = { status: prev };
      if (typeof result.previous_is_archived === "boolean") {
        fields.is_archived = result.previous_is_archived;
      }
      return {
        kind: "update",
        table: "projects",
        id: String(p.id),
        fields,
      };
    }
    case "apply_update_invoice_address": {
      const p = result.property as { id?: string } | undefined;
      if (!p?.id) return null;
      return {
        kind: "update",
        table: "properties",
        id: String(p.id),
        fields: {
          invoice_address: result.previous_invoice_address ?? null,
        },
      };
    }
    case "apply_update_property": {
      const p = result.property as { id?: string } | undefined;
      const prev = result.previous as Record<string, unknown> | undefined;
      if (!p?.id || !prev) return null;
      return {
        kind: "update",
        table: "properties",
        id: String(p.id),
        fields: prev,
      };
    }
    case "apply_update_component": {
      const c = result.component as { id?: string } | undefined;
      const prev = result.previous as Record<string, unknown> | undefined;
      if (!c?.id || !prev) return null;
      return {
        kind: "update",
        table: "components",
        id: String(c.id),
        fields: prev,
      };
    }
    case "apply_update_contact": {
      const c = result.contact as { id?: string } | undefined;
      const prev = result.previous as Record<string, unknown> | undefined;
      if (!c?.id || !prev) return null;
      return {
        kind: "update",
        table: "property_contacts",
        id: String(c.id),
        fields: prev,
      };
    }
    case "apply_create_work_order": {
      const wo = result.work_order as { id?: string } | undefined;
      if (!wo?.id) return null;
      return { kind: "delete", table: "work_orders", id: String(wo.id) };
    }
    case "apply_create_project": {
      const p = result.project as { id?: string } | undefined;
      if (!p?.id) return null;
      return { kind: "delete", table: "projects", id: String(p.id) };
    }
    case "apply_property_note": {
      const n = result.note as { id?: string } | undefined;
      if (!n?.id) return null;
      return { kind: "delete", table: "property_notes", id: String(n.id) };
    }
    case "apply_create_property": {
      const p = result.property as { id?: string } | undefined;
      if (!p?.id) return null;
      return { kind: "delete", table: "properties", id: String(p.id) };
    }
    case "apply_create_component": {
      const c = result.component as { id?: string } | undefined;
      if (!c?.id) return null;
      return { kind: "delete", table: "components", id: String(c.id) };
    }
    case "apply_log_service": {
      const s = result.service as { id?: string } | undefined;
      if (!s?.id) return null;
      return { kind: "delete", table: "maintenance_history", id: String(s.id) };
    }
    case "apply_create_contact": {
      const c = result.contact as { id?: string } | undefined;
      if (!c?.id) return null;
      return { kind: "delete", table: "property_contacts", id: String(c.id) };
    }
    case "apply_create_todo": {
      const t = result.todo as { id?: string } | undefined;
      if (!t?.id) return null;
      return { kind: "delete", table: "property_todos", id: String(t.id) };
    }
    case "apply_complete_todo": {
      const t = result.todo as { id?: string } | undefined;
      if (!t?.id || result.previous_completed === undefined) return null;
      return {
        kind: "update",
        table: "property_todos",
        id: String(t.id),
        fields: { completed: result.previous_completed },
      };
    }
    case "apply_add_project_cost": {
      const c = result.cost_item as { id?: string } | undefined;
      if (!c?.id) return null;
      return { kind: "delete", table: "project_cost_items", id: String(c.id) };
    }
    case "apply_add_budget_item": {
      const b = result.budget_item as { id?: string } | undefined;
      if (!b?.id) return null;
      return { kind: "delete", table: "project_budget_items", id: String(b.id) };
    }
    case "apply_complete_checklist_item": {
      const c = result.checklist_item as { id?: string } | undefined;
      if (!c?.id || result.previous_completed === undefined) return null;
      return {
        kind: "update",
        table: "project_checklist_items",
        id: String(c.id),
        fields: {
          completed: result.previous_completed,
          completed_at: null,
          completed_by: null,
        },
      };
    }
    default:
      return null;
  }
}

export function isWithinUndoWindow(createdAt: string, now = Date.now()): boolean {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return now - t <= UNDO_WINDOW_MS;
}

export function undoDeadline(createdAt: string): string {
  return new Date(new Date(createdAt).getTime() + UNDO_WINDOW_MS).toISOString();
}

/** Verify row belongs to org before mutating. */
async function assertEntityInOrg(
  supabase: SupabaseClient,
  orgId: string,
  table: string,
  id: string,
): Promise<boolean> {
  if (!ALLOWED_TABLES.has(table)) return false;

  if (table === "properties") {
    const { data } = await supabase
      .from("properties")
      .select("id")
      .eq("id", id)
      .eq("organization_id", orgId)
      .maybeSingle();
    return Boolean(data);
  }

  if (table === "work_orders" || table === "projects" || table === "components") {
    const { data } = await supabase
      .from(table)
      .select("id, properties!inner(organization_id)")
      .eq("id", id)
      .eq("properties.organization_id", orgId)
      .maybeSingle();
    return Boolean(data);
  }

  if (
    table === "property_notes" ||
    table === "property_contacts" ||
    table === "property_todos"
  ) {
    const { data } = await supabase
      .from(table)
      .select("id, properties!inner(organization_id)")
      .eq("id", id)
      .eq("properties.organization_id", orgId)
      .maybeSingle();
    return Boolean(data);
  }

  if (
    table === "project_cost_items" ||
    table === "project_budget_items" ||
    table === "project_checklist_items"
  ) {
    const { data } = await supabase
      .from(table)
      .select(
        "id, projects!inner(property_id, properties!inner(organization_id))",
      )
      .eq("id", id)
      .eq("projects.properties.organization_id", orgId)
      .maybeSingle();
    return Boolean(data);
  }

  if (table === "maintenance_history") {
    const { data } = await supabase
      .from("maintenance_history")
      .select("id, components!inner(property_id, properties!inner(organization_id))")
      .eq("id", id)
      .eq("components.properties.organization_id", orgId)
      .maybeSingle();
    return Boolean(data);
  }

  return false;
}

export async function executeReversePayload(
  ctx: UndoContext,
  reverse: ReversePayload,
): Promise<{ ok: boolean; error?: string }> {
  if (!ALLOWED_TABLES.has(reverse.table)) {
    return { ok: false, error: `Otillåten tabell: ${reverse.table}` };
  }

  const inOrg = await assertEntityInOrg(
    ctx.supabase,
    ctx.orgId,
    reverse.table,
    reverse.id,
  );
  if (!inOrg) {
    return { ok: false, error: "Posten hittades inte i din organisation (ev. redan borttagen)" };
  }

  if (reverse.kind === "update") {
    const { error } = await ctx.supabase
      .from(reverse.table)
      .update(reverse.fields)
      .eq("id", reverse.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  if (reverse.kind === "delete") {
    // Soft-safe: for properties only delete if no components
    if (reverse.table === "properties") {
      const { count } = await ctx.supabase
        .from("components")
        .select("id", { count: "exact", head: true })
        .eq("property_id", reverse.id);
      if ((count ?? 0) > 0) {
        return {
          ok: false,
          error:
            "Kan inte ångra skapad fastighet: den har redan komponenter. Ta bort manuellt vid behov.",
        };
      }
    }
    const { error } = await ctx.supabase
      .from(reverse.table)
      .delete()
      .eq("id", reverse.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  return { ok: false, error: "Okänd reverse-kind" };
}

export type ActionLogRow = {
  id: string;
  tool_name: string;
  created_at: string;
  reverse_payload: ReversePayload | null;
  result_full: Record<string, unknown> | null;
  result_summary: Record<string, unknown> | null;
  entity_type: string | null;
  entity_id: string | null;
  link_hint: string | null;
  undone_at: string | null;
  success: boolean;
  idempotency_key: string | null;
};

export async function findIdempotentHit(
  ctx: UndoContext,
  idempotencyKey: string,
): Promise<ActionLogRow | null> {
  const { data } = await ctx.supabase
    .from("jarvis_action_log")
    .select(
      "id, tool_name, created_at, reverse_payload, result_full, result_summary, entity_type, entity_id, link_hint, undone_at, success, idempotency_key",
    )
    .eq("organization_id", ctx.orgId)
    .eq("user_id", ctx.userId)
    .eq("idempotency_key", idempotencyKey)
    .eq("success", true)
    .is("undone_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ActionLogRow | null) ?? null;
}

export async function undoActionById(
  ctx: UndoContext,
  actionLogId: string,
): Promise<Record<string, unknown>> {
  const { data: row, error } = await ctx.supabase
    .from("jarvis_action_log")
    .select(
      "id, tool_name, created_at, reverse_payload, result_full, entity_type, entity_id, undone_at, success, user_id, organization_id",
    )
    .eq("id", actionLogId)
    .maybeSingle();

  if (error || !row) return { error: "Åtgärden hittades inte" };
  if (row.organization_id !== ctx.orgId) {
    return { error: "Åtgärden tillhör inte din organisation" };
  }
  if (row.user_id !== ctx.userId) {
    return { error: "Du kan bara ångra egna Jarvis-åtgärder" };
  }
  if (!row.success) return { error: "Misslyckade åtgärder kan inte ångras" };
  if (row.undone_at) {
    return { error: "Åtgärden är redan ångrad", already_undone: true };
  }
  if (!isWithinUndoWindow(row.created_at as string)) {
    return {
      error: "Ångrafönstret har gått ut (5 minuter). Ändra manuellt i appen.",
      undo_window_expired: true,
    };
  }
  if (row.tool_name === "send_to_me") {
    return { error: "Skickad e-post kan inte ångras" };
  }

  const reverse = row.reverse_payload as ReversePayload | null;
  if (!reverse) {
    return { error: "Ingen ångringsdata sparad för denna åtgärd" };
  }

  const exec = await executeReversePayload(ctx, reverse);
  if (!exec.ok) {
    return { error: exec.error || "Kunde inte ångra", applied: false };
  }

  const now = new Date().toISOString();
  await ctx.supabase
    .from("jarvis_action_log")
    .update({ undone_at: now })
    .eq("id", row.id);

  // Audit the undo itself
  await ctx.supabase.from("jarvis_action_log").insert({
    organization_id: ctx.orgId,
    user_id: ctx.userId,
    tool_name: "undo_jarvis_action",
    args_summary: { action_log_id: row.id, original_tool: row.tool_name },
    result_summary: { undone: true, original_id: row.id },
    result_full: { undone: true, original_tool: row.tool_name },
    success: true,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    undo_of: row.id,
  });

  return {
    applied: true,
    undone: true,
    action_log_id: row.id,
    original_tool: row.tool_name,
    summary: `Ångrade: ${row.tool_name}`,
    ui: { confirm: true, undo: true },
  };
}

export async function undoLastAction(
  ctx: UndoContext,
): Promise<Record<string, unknown>> {
  const since = new Date(Date.now() - UNDO_WINDOW_MS).toISOString();
  const { data: row } = await ctx.supabase
    .from("jarvis_action_log")
    .select("id")
    .eq("organization_id", ctx.orgId)
    .eq("user_id", ctx.userId)
    .eq("success", true)
    .is("undone_at", null)
    .not("reverse_payload", "is", null)
    .gte("created_at", since)
    .neq("tool_name", "undo_jarvis_action")
    .neq("tool_name", "send_to_me")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) {
    return {
      error:
        "Ingen ångringsbar Jarvis-åtgärd de senaste 5 minuterna. (E-post och vissa åtgärder går inte att ångra.)",
    };
  }
  return undoActionById(ctx, row.id as string);
}
