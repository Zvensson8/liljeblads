// Agent webhook — API-key auth for Jarvis / external workers (lbl_ keys)
// and creates a todo in `property_todos`, scoped to the organization
// that owns the API key (lbl_ prefix, hashed in `api_keys`).
//
// Auth: send the API key in either header:
//   Authorization: Bearer <key>
//   x-api-key: <key>
//
// The key must have the "create_todo" permission.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CrewAIPayload {
  // "todo" (default) creates a property_todos row
  // "work_order" creates a work_orders row
  // "search_components" returns matching components (read-only)
  // "log_service" creates a maintenance_history row on a component
  // "list_services" returns maintenance_history rows for a component
  // "delete_service" removes a maintenance_history row (and its documents)
  type?:
    | "todo"
    | "work_order"
    | "search_components"
    | "log_service"
    | "list_services"
    | "delete_service"
    | "list_properties"
    | "list_processed_files"
    | "mark_processed"
    | "start_agent_run"
    | "finish_agent_run"
    | "get_notify_email";
  action_text?: string;
  component_system?: string;
  priority?: string;
  price_estimate?: string;
  raw_context?: string;
  report_filename?: string;
  report_drive_link?: string;
  source?: string;
  created_at?: string;
  // Optional targeting — if omitted, todo is created without a property.
  // Required when type = "work_order".
  property_id?: string;
  property_name?: string;
  due_date?: string;
  // Optional extras for work orders
  contractor?: string;
  quarter?: string;
  // search_components fields
  query?: string;
  limit?: number;
  // log_service / list_services / delete_service fields
  component_id?: string;
  serial_number?: string;
  registration_number?: string;
  action_type?: string;
  performed_date?: string; // YYYY-MM-DD
  supplier?: string;
  cost?: string | number;
  category?: "planned" | "preventive" | "acute" | "warranty";
  notes?: string;
  // delete_service: id of maintenance_history row
  service_id?: string;
  // agent idempotency / runs
  external_file_id?: string;
  filename?: string;
  file_status?: "processed" | "failed" | "skipped" | "partial";
  summary?: Record<string, unknown>;
  error_message?: string;
  run_id?: string;
  run_type?: string;
  run_status?: "running" | "completed" | "failed" | "partial";
  stats?: Record<string, unknown>;
}

function parsePrice(p?: string): number | null {
  if (!p) return null;
  const n = Number(String(p).replace(/[^\d.,-]/g, "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function hashApiKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function mapPriority(p?: string): "low" | "medium" | "high" {
  const v = (p ?? "").trim().toLowerCase().normalize("NFC");
  // Swedish + English; use includes so "hög prioritet" still works
  if (v.includes("hög") || v.includes("hog") || v === "high" || v === "h") return "high";
  if (v.includes("låg") || v.includes("lag") || v === "low" || v === "l") return "low";
  if (v.includes("medium") || v.includes("medel") || v === "m") return "medium";
  return "medium";
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Extract API key from Authorization: Bearer <key> or x-api-key
    const authHeader = req.headers.get("authorization") ?? "";
    const bearer = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const apiKey = bearer || req.headers.get("x-api-key") || "";

    if (!apiKey) {
      return json({ success: false, error: "Missing API key" }, 401);
    }

    // Validate against api_keys table
    const keyHash = await hashApiKey(apiKey);
    const { data: keyRow, error: keyErr } = await supabase
      .from("api_keys")
      .select("id, organization_id, permissions, is_active, expires_at, created_by")
      .eq("key_hash", keyHash)
      .single();

    if (keyErr || !keyRow || !keyRow.is_active) {
      return json({ success: false, error: "Invalid API key" }, 401);
    }
    if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
      return json({ success: false, error: "API key expired" }, 401);
    }
    const permissions: string[] = keyRow.permissions ?? [];
    // Permission check happens per-type below (create_todo / create_work_order).

    // Parse payload
    const payload = (await req.json().catch(() => ({}))) as CrewAIPayload;

    // ============ search_components (read-only) ============
    if (payload.type === "search_components") {
      if (
        !permissions.includes("read_components") &&
        !permissions.includes("list_components") &&
        !permissions.includes("create_todo") &&
        !permissions.includes("log_service")
      ) {
        return json({ success: false, error: "API key missing 'read_components' permission" }, 403);
      }
      const q = (payload.query ?? "").trim();
      const limit = Math.min(Math.max(payload.limit ?? 10, 1), 50);

      // Scope to properties in this org
      const { data: props } = await supabase
        .from("properties")
        .select("id, name")
        .eq("organization_id", keyRow.organization_id);
      const propMap = new Map((props ?? []).map((p) => [p.id, p.name]));
      const propIds = Array.from(propMap.keys());

      if (propIds.length === 0) return json({ success: true, type: "search_components", results: [] });

      let cq = supabase
        .from("components")
        .select("id, name, type, manufacturer, model, serial_number, registration_number, aff_code, room_zone, property_id, floor_id, status, next_service_date")
        .in("property_id", propIds)
        .limit(limit);

      if (payload.property_id || payload.property_name) {
        const propRef = payload.property_id || payload.property_name!;
        const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const match = uuidRe.test(propRef)
          ? (props ?? []).find((p) => p.id === propRef)
          : (props ?? []).find((p) => p.name.toLowerCase() === propRef.toLowerCase());
        if (match) cq = cq.eq("property_id", match.id);
      }
      if (q) {
        const esc = q.replace(/[%,()]/g, "");
        cq = cq.or(
          `name.ilike.%${esc}%,serial_number.ilike.%${esc}%,registration_number.ilike.%${esc}%,aff_code.ilike.%${esc}%,manufacturer.ilike.%${esc}%,model.ilike.%${esc}%`,
        );
      }

      const { data: comps, error: searchErr } = await cq;
      if (searchErr) {
        return json({ success: false, error: "Search failed", details: searchErr.message }, 500);
      }

      const results = (comps ?? []).map((c) => ({
        ...c,
        property_name: propMap.get(c.property_id) ?? null,
      }));

      await supabase
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", keyRow.id);

      return json({ success: true, type: "search_components", count: results.length, results });
    }

    // ============ list_properties (Jarvis) ============
    if (payload.type === "list_properties") {
      if (
        !permissions.includes("read_components") &&
        !permissions.includes("create_work_order") &&
        !permissions.includes("create_todo") &&
        !permissions.includes("log_service")
      ) {
        return json({ success: false, error: "API key missing read permission" }, 403);
      }
      const { data: props, error: propErr } = await supabase
        .from("properties")
        .select("id, name, address, property_number")
        .eq("organization_id", keyRow.organization_id)
        .order("name");
      if (propErr) {
        return json({ success: false, error: propErr.message }, 500);
      }
      await supabase
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", keyRow.id);
      return json({
        success: true,
        type: "list_properties",
        organization_id: keyRow.organization_id,
        count: (props ?? []).length,
        results: props ?? [],
      });
    }

    // ============ list_processed_files (Jarvis idempotency) ============
    if (payload.type === "list_processed_files") {
      const source = payload.source ?? "inbox";
      const { data: rows, error: pe } = await supabase
        .from("agent_processed_files")
        .select("external_file_id, filename, status, processed_at")
        .eq("organization_id", keyRow.organization_id)
        .eq("source", source)
        .order("processed_at", { ascending: false })
        .limit(Math.min(Math.max(payload.limit ?? 2000, 1), 5000));
      if (pe) return json({ success: false, error: pe.message }, 500);
      return json({
        success: true,
        type: "list_processed_files",
        ids: (rows ?? []).map((r) => r.external_file_id),
        results: rows ?? [],
      });
    }

    // ============ mark_processed ============
    if (payload.type === "mark_processed") {
      const fileId = (payload.external_file_id ?? "").trim();
      if (!fileId) {
        return json({ success: false, error: "external_file_id required" }, 400);
      }
      const source = payload.source ?? "inbox";
      const status = payload.file_status ?? "processed";
      const { data: row, error: me } = await supabase
        .from("agent_processed_files")
        .upsert(
          {
            organization_id: keyRow.organization_id,
            external_file_id: fileId,
            filename: payload.filename ?? payload.report_filename ?? null,
            source,
            status,
            summary: payload.summary ?? {},
            error_message: payload.error_message ?? null,
            processed_at: new Date().toISOString(),
          },
          { onConflict: "organization_id,source,external_file_id" },
        )
        .select("id, external_file_id, status")
        .single();
      if (me) return json({ success: false, error: me.message }, 500);
      return json({ success: true, type: "mark_processed", result: row });
    }

    // ============ get_notify_email (API key owner / org admin) ============
    if (payload.type === "get_notify_email") {
      // Prefer API key creator (the user who created the key = "logged in" context for agents)
      let email: string | null = null;
      if (keyRow.created_by) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", keyRow.created_by)
          .maybeSingle();
        email = prof?.email ?? null;
      }
      if (!email) {
        const { data: owner } = await supabase
          .from("organization_members")
          .select("user_id, profiles:user_id(email)")
          .eq("organization_id", keyRow.organization_id)
          .eq("role", "owner")
          .limit(1)
          .maybeSingle();
        // deno-lint-ignore no-explicit-any
        email = (owner as any)?.profiles?.email ?? null;
      }
      return json({
        success: true,
        type: "get_notify_email",
        email,
        organization_id: keyRow.organization_id,
      });
    }

    // ============ start_agent_run / finish_agent_run ============
    if (payload.type === "start_agent_run") {
      const { data: run, error: re } = await supabase
        .from("agent_runs")
        .insert({
          organization_id: keyRow.organization_id,
          run_type: payload.run_type ?? "service_report_ingest",
          status: "running",
          stats: payload.stats ?? {},
        })
        .select("id")
        .single();
      if (re) return json({ success: false, error: re.message }, 500);
      return json({ success: true, type: "start_agent_run", run_id: run.id });
    }

    if (payload.type === "finish_agent_run") {
      if (!payload.run_id) {
        return json({ success: false, error: "run_id required" }, 400);
      }
      const { data: run, error: fe } = await supabase
        .from("agent_runs")
        .update({
          status: payload.run_status ?? "completed",
          stats: payload.stats ?? {},
          error_message: payload.error_message ?? null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", payload.run_id)
        .eq("organization_id", keyRow.organization_id)
        .select("id, status")
        .single();
      if (fe) return json({ success: false, error: fe.message }, 500);
      return json({ success: true, type: "finish_agent_run", result: run });
    }

    // Helper: resolve a component belonging to this org by id / serial / registration
    async function resolveComponentForOrg(): Promise<
      { id: string; property_id: string } | { error: string; status: number }
    > {
      if (payload.component_id) {
        const { data: comp } = await supabase
          .from("components")
          .select("id, property_id, properties!inner(organization_id)")
          .eq("id", payload.component_id)
          .maybeSingle();
        // deno-lint-ignore no-explicit-any
        const orgId = (comp as any)?.properties?.organization_id;
        if (!comp || orgId !== keyRow.organization_id) {
          return { error: "Component not accessible", status: 403 };
        }
        return { id: comp.id, property_id: comp.property_id };
      }
      const lookup = payload.serial_number ?? payload.registration_number;
      if (!lookup) {
        return {
          error: "Provide component_id, serial_number, or registration_number",
          status: 400,
        };
      }
      const { data: props } = await supabase
        .from("properties")
        .select("id")
        .eq("organization_id", keyRow.organization_id);
      const propIds = (props ?? []).map((p) => p.id);
      if (propIds.length === 0) return { error: "No properties in organization", status: 404 };
      const field = payload.serial_number ? "serial_number" : "registration_number";
      const { data: comp } = await supabase
        .from("components")
        .select("id, property_id")
        .in("property_id", propIds)
        .eq(field, lookup)
        .maybeSingle();
      if (!comp) return { error: `Component not found by ${field}=${lookup}`, status: 404 };
      return { id: comp.id, property_id: comp.property_id };
    }

    // ============ list_services (read maintenance_history) ============
    if (payload.type === "list_services") {
      if (!permissions.includes("read_components") && !permissions.includes("log_service") && !permissions.includes("create_todo")) {
        return json({ success: false, error: "API key missing 'read_components' permission" }, 403);
      }
      const resolved = await resolveComponentForOrg();
      if ("error" in resolved) return json({ success: false, error: resolved.error }, resolved.status);

      const limit = Math.min(Math.max(payload.limit ?? 50, 1), 200);
      const { data: services, error: listErr } = await supabase
        .from("maintenance_history")
        .select("id, component_id, action_type, performed_date, supplier, cost, category, notes, work_order_id, created_at")
        .eq("component_id", resolved.id)
        .order("performed_date", { ascending: false })
        .limit(limit);
      if (listErr) {
        return json({ success: false, error: "List failed", details: listErr.message }, 500);
      }

      const serviceIds = (services ?? []).map((s) => s.id);
      let docsBySvc: Record<string, Array<{ id: string; file_name: string; file_url: string }>> = {};
      if (serviceIds.length > 0) {
        const { data: docs } = await supabase
          .from("maintenance_history_documents")
          .select("id, maintenance_history_id, file_name, file_url")
          .in("maintenance_history_id", serviceIds);
        docsBySvc = (docs ?? []).reduce((acc, d) => {
          (acc[d.maintenance_history_id] ??= []).push({
            id: d.id,
            file_name: d.file_name,
            file_url: d.file_url,
          });
          return acc;
        }, {} as typeof docsBySvc);
      }

      const results = (services ?? []).map((s) => ({ ...s, documents: docsBySvc[s.id] ?? [] }));

      await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
      return json({ success: true, type: "list_services", count: results.length, results });
    }

    // ============ delete_service (remove maintenance_history + docs) ============
    if (payload.type === "delete_service") {
      if (!permissions.includes("log_service") && !permissions.includes("create_todo")) {
        return json({ success: false, error: "API key missing 'log_service' permission" }, 403);
      }
      if (!payload.service_id) {
        return json({ success: false, error: "service_id is required" }, 400);
      }

      // Verify service belongs to a component in this org
      const { data: svc } = await supabase
        .from("maintenance_history")
        .select("id, component_id, components!inner(property_id, properties!inner(organization_id))")
        .eq("id", payload.service_id)
        .maybeSingle();
      // deno-lint-ignore no-explicit-any
      const orgId = (svc as any)?.components?.properties?.organization_id;
      if (!svc || orgId !== keyRow.organization_id) {
        return json({ success: false, error: "Service not accessible" }, 403);
      }

      // Delete storage files, then doc rows, then service row
      const { data: docs } = await supabase
        .from("maintenance_history_documents")
        .select("id, file_url")
        .eq("maintenance_history_id", payload.service_id);

      const getPath = (fileUrl: string): string | null => {
        try {
          const parts = new URL(fileUrl).pathname.split("/").filter(Boolean);
          const i = parts.findIndex((p) => p === "maintenance-documents");
          return i === -1 ? null : parts.slice(i + 1).join("/");
        } catch {
          return null;
        }
      };

      const paths = (docs ?? []).map((d) => getPath(d.file_url)).filter((p): p is string => !!p);
      if (paths.length > 0) {
        await supabase.storage.from("maintenance-documents").remove(paths);
      }
      await supabase.from("maintenance_history_documents").delete().eq("maintenance_history_id", payload.service_id);

      const { error: delErr } = await supabase
        .from("maintenance_history")
        .delete()
        .eq("id", payload.service_id);
      if (delErr) {
        return json({ success: false, error: "Failed to delete service", details: delErr.message }, 500);
      }

      await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
      await supabase.from("ai_suggested_actions").insert({
        organization_id: keyRow.organization_id,
        action_type: "delete_service",
        payload: payload as unknown as Record<string, unknown>,
        source_document_type: "crewai_webhook",
        status: "executed",
        executed_at: new Date().toISOString(),
        execution_result: { deleted_id: payload.service_id },
        confidence_score: 1.0,
        reasoning: "Deleted via agent webhook",
      });

      return json({ success: true, type: "delete_service", deleted_id: payload.service_id });
    }

    // ============ log_service (create maintenance_history) ============
    if (payload.type === "log_service") {
      if (!permissions.includes("log_service") && !permissions.includes("create_todo")) {
        return json({ success: false, error: "API key missing 'log_service' permission" }, 403);
      }
      if (!payload.action_type || !payload.action_type.trim()) {
        return json({ success: false, error: "action_type is required for log_service" }, 400);
      }
      if (!payload.performed_date) {
        return json({ success: false, error: "performed_date (YYYY-MM-DD) is required" }, 400);
      }

      // Resolve component — id, or serial/registration lookup scoped to org
      let componentId = payload.component_id ?? null;
      if (!componentId) {
        const lookup = payload.serial_number ?? payload.registration_number;
        if (!lookup) {
          return json(
            { success: false, error: "Provide component_id, serial_number, or registration_number" },
            400,
          );
        }
        const { data: props } = await supabase
          .from("properties")
          .select("id")
          .eq("organization_id", keyRow.organization_id);
        const propIds = (props ?? []).map((p) => p.id);
        if (propIds.length === 0) {
          return json({ success: false, error: "No properties in organization" }, 404);
        }
        const field = payload.serial_number ? "serial_number" : "registration_number";
        const { data: comp } = await supabase
          .from("components")
          .select("id, property_id")
          .in("property_id", propIds)
          .eq(field, lookup)
          .maybeSingle();
        if (!comp) {
          return json({ success: false, error: `Component not found by ${field}=${lookup}` }, 404);
        }
        componentId = comp.id;
      } else {
        // Verify component belongs to org
        const { data: comp } = await supabase
          .from("components")
          .select("id, property_id, properties!inner(organization_id)")
          .eq("id", componentId)
          .maybeSingle();
        // deno-lint-ignore no-explicit-any
        const orgId = (comp as any)?.properties?.organization_id;
        if (!comp || orgId !== keyRow.organization_id) {
          return json({ success: false, error: "Component not accessible" }, 403);
        }
      }

      const costNum =
        typeof payload.cost === "number" ? payload.cost : parsePrice(String(payload.cost ?? ""));

      const { data: mh, error: mhErr } = await supabase
        .from("maintenance_history")
        .insert({
          component_id: componentId,
          action_type: payload.action_type.trim(),
          performed_date: payload.performed_date,
          supplier: payload.supplier ?? null,
          cost: costNum,
          category: payload.category ?? "planned",
          notes: payload.notes ?? payload.raw_context ?? null,
        })
        .select("id, component_id, action_type, performed_date, category, cost")
        .single();

      if (mhErr) {
        console.error("Service log insert failed:", mhErr);
        return json(
          { success: false, error: "Failed to log service", details: mhErr.message },
          500,
        );
      }

      await supabase
        .from("api_keys")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", keyRow.id);

      await supabase.from("ai_suggested_actions").insert({
        organization_id: keyRow.organization_id,
        action_type: "log_service",
        payload: payload as unknown as Record<string, unknown>,
        source_document_type: "crewai_webhook",
        status: "executed",
        executed_at: new Date().toISOString(),
        execution_result: mh as Record<string, unknown>,
        confidence_score: 1.0,
        reasoning: "Logged via agent webhook",
      });

      return json({ success: true, type: "log_service", result: mh });
    }

    // ============ todo / work_order (existing behavior) ============
    if (!payload.action_text || !payload.action_text.trim()) {
      return json({ success: false, error: "action_text is required" }, 400);
    }

    // Optional property resolution (id OR name), scoped to org
    let propertyId: string | null = null;
    let propertyName: string | null = null;
    const propRef = payload.property_id || payload.property_name;
    if (propRef) {
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let q = supabase
        .from("properties")
        .select("id, name")
        .eq("organization_id", keyRow.organization_id)
        .limit(1);
      q = uuidRe.test(propRef) ? q.eq("id", propRef) : q.ilike("name", propRef);
      const { data: prop } = await q.maybeSingle();
      if (prop) {
        propertyId = prop.id;
        propertyName = prop.name;
      }
    }

    // Build notes block combining context + source metadata
    const notesParts: string[] = [];
    if (payload.component_system) notesParts.push(`System: ${payload.component_system}`);
    if (payload.price_estimate) notesParts.push(`Prisuppskattning: ${payload.price_estimate}`);
    if (payload.raw_context) notesParts.push(`\nUtdrag ur rapport:\n${payload.raw_context}`);
    if (payload.report_filename || payload.report_drive_link) {
      notesParts.push(
        `\nKälla: ${payload.report_filename ?? ""}${
          payload.report_drive_link ? ` (${payload.report_drive_link})` : ""
        }`.trim(),
      );
    }
    notesParts.push(`\n— Skapad av Jarvis (${payload.source ?? "jarvis_worker"})`);

    // Short, human-friendly title
    const rawTitle = payload.action_text.trim().replace(/\s+/g, " ");
    const title = rawTitle.length > 140 ? `${rawTitle.slice(0, 137)}...` : rawTitle;

    const wantsWorkOrder = payload.type === "work_order";
    const permissionNeeded = wantsWorkOrder ? "create_work_order" : "create_todo";
    if (!permissions.includes(permissionNeeded) && !permissions.includes("create_todo")) {
      return json(
        { success: false, error: `API key missing '${permissionNeeded}' permission` },
        403,
      );
    }

    // Resolve component for WO (so it shows under component Arbetsordrar tab)
    let resolvedComponentId: string | null = payload.component_id ?? null;
    if (wantsWorkOrder && propertyId) {
      const { data: orgProps } = await supabase
        .from("properties")
        .select("id")
        .eq("organization_id", keyRow.organization_id);
      const orgPropIds = (orgProps ?? []).map((p) => p.id);

      if (resolvedComponentId) {
        const { data: comp } = await supabase
          .from("components")
          .select("id, property_id")
          .eq("id", resolvedComponentId)
          .in("property_id", orgPropIds)
          .maybeSingle();
        if (!comp) resolvedComponentId = null;
        else if (!propertyId) propertyId = comp.property_id;
      }

      if (!resolvedComponentId && (payload.serial_number || payload.registration_number)) {
        const field = payload.serial_number ? "serial_number" : "registration_number";
        const val = payload.serial_number ?? payload.registration_number!;
        let cq = supabase
          .from("components")
          .select("id, property_id")
          .in("property_id", orgPropIds)
          .eq(field, val)
          .limit(1);
        if (propertyId) cq = cq.eq("property_id", propertyId);
        const { data: comp } = await cq.maybeSingle();
        if (comp) {
          resolvedComponentId = comp.id;
          if (!propertyId) propertyId = comp.property_id;
        }
      }

      // Fallback: match component_system against name/aff_code within property
      if (!resolvedComponentId && payload.component_system && propertyId) {
        const tag = payload.component_system.trim();
        const { data: comps } = await supabase
          .from("components")
          .select("id, name, aff_code")
          .eq("property_id", propertyId)
          .limit(100);
        const norm = (s: string) => s.toLowerCase().replace(/[\s\-_.:]/g, "");
        const hit = (comps ?? []).find(
          (c) =>
            norm(c.name || "") === norm(tag) ||
            norm(c.aff_code || "") === norm(tag) ||
            norm(c.name || "").includes(norm(tag)),
        );
        if (hit) resolvedComponentId = hit.id;
      }
    }

    let created: Record<string, unknown>;
    let actionType: string;

    if (wantsWorkOrder) {
      if (!propertyId) {
        return json(
          {
            success: false,
            error:
              "work_order requires a valid property_id or property_name matching a property in the organization",
          },
          400,
        );
      }

      const commentParts = notesParts.slice();
      const workOrder = {
        property_id: propertyId,
        component_id: resolvedComponentId,
        action: title,
        status: "not_started" as const,
        priority: mapPriority(payload.priority),
        price: parsePrice(payload.price_estimate),
        contractor: payload.contractor ?? null,
        due_date: payload.due_date ?? null,
        quarter: payload.quarter ?? null,
        comments: commentParts.join("\n"),
      };

      const { data, error: insertErr } = await supabase
        .from("work_orders")
        .insert(workOrder)
        .select("id, action, priority, status, property_id, component_id, price")
        .single();

      if (insertErr) {
        console.error("Work order insert failed:", insertErr);
        return json(
          { success: false, error: "Failed to create work order", details: insertErr.message },
          500,
        );
      }
      created = data as Record<string, unknown>;
      actionType = "create_work_order";
    } else {
      const todo = {
        property_id: propertyId,
        user_id: keyRow.created_by ?? null,
        title,
        notes: notesParts.join("\n"),
        priority: mapPriority(payload.priority),
        category: payload.component_system?.toLowerCase() || "övrigt",
        due_date: payload.due_date ?? null,
        completed: false,
      };

      const { data, error: insertErr } = await supabase
        .from("property_todos")
        .insert(todo)
        .select("id, title, priority, property_id")
        .single();

      if (insertErr) {
        console.error("Todo insert failed:", insertErr);
        return json(
          { success: false, error: "Failed to create todo", details: insertErr.message },
          500,
        );
      }
      created = data as Record<string, unknown>;
      actionType = "create_todo";
    }

    // Update last_used_at
    await supabase
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRow.id);

    // Log for audit / AI-actions dashboard
    await supabase.from("ai_suggested_actions").insert({
      organization_id: keyRow.organization_id,
      action_type: actionType,
      payload: payload as unknown as Record<string, unknown>,
      source_document_type: "crewai_webhook",
      status: "executed",
      executed_at: new Date().toISOString(),
      execution_result: created,
      confidence_score: 1.0,
      reasoning: "Created via agent webhook",
    });

    return json({
      success: true,
      type: wantsWorkOrder ? "work_order" : "todo",
      result: {
        ...created,
        property_name: propertyName,
      },
    });
  } catch (err) {
    console.error("crewai-webhook error:", err);
    return json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
