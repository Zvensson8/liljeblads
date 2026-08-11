// Jarvis agent webhook — API-key auth for LangGraph worker / external agents
// (lbl_ keys, hashed in `api_keys`). Function folder may still be named
// crewai-webhook for backwards-compatible URLs; runtime is LangGraph only.
//
// Auth: Authorization: Bearer <key>  or  x-api-key: <key>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  computeComponentRiskBatch,
  filterRiskResults,
  type ComponentRiskInput,
  type RiskLevel,
} from "../_shared/componentRisk.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface JarvisWebhookPayload {
  // Write
  // "todo" | "work_order" | "suggest_work_order" | "log_service" | "delete_service"
  // Read / Jarvis
  // "search_components" | "list_services" | "list_work_orders"
  // "list_high_risk_components" | "get_property_overview" | "search_property_documents"
  // "list_properties" | agent idempotency types
  type?:
    | "todo"
    | "work_order"
    | "suggest_work_order"
    | "search_components"
    | "log_service"
    | "list_services"
    | "list_work_orders"
    | "list_high_risk_components"
    | "get_property_overview"
    | "search_property_documents"
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
  // search_components / list filters
  query?: string;
  limit?: number;
  status?: string;
  min_level?: string;
  min_confidence?: string;
  reasoning?: string;
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
    const payload = (await req.json().catch(() => ({}))) as JarvisWebhookPayload;

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
        .select("id, name, type, manufacturer, model, serial_number, registration_number, aff_code, room_zone, property_id, status, next_service_date")
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
        !permissions.includes("list_properties") &&
        !permissions.includes("list_components") &&
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

    // ============ list_work_orders (Jarvis chat / ops) ============
    if (payload.type === "list_work_orders") {
      if (
        !permissions.includes("create_work_order") &&
        !permissions.includes("list_components") &&
        !permissions.includes("get_pending_actions") &&
        !permissions.includes("read_components")
      ) {
        return json({ success: false, error: "API key missing work-order read permission" }, 403);
      }

      const { data: props } = await supabase
        .from("properties")
        .select("id, name")
        .eq("organization_id", keyRow.organization_id);
      let propIds = (props ?? []).map((p) => p.id as string);
      const propNameMap = new Map((props ?? []).map((p) => [p.id as string, p.name as string]));

      if (payload.property_id) {
        if (!propIds.includes(payload.property_id)) {
          return json({ success: false, error: "property not in organization" }, 403);
        }
        propIds = [payload.property_id];
      } else if (payload.property_name) {
        const needle = payload.property_name.trim().toLowerCase();
        propIds = (props ?? [])
          .filter((p) => (p.name || "").toLowerCase().includes(needle))
          .map((p) => p.id as string);
        if (!propIds.length) {
          return json({ success: true, type: "list_work_orders", count: 0, results: [] });
        }
      }

      if (!propIds.length) {
        return json({ success: true, type: "list_work_orders", count: 0, results: [] });
      }

      const limit = Math.min(Math.max(payload.limit ?? 50, 1), 200);
      let wq = supabase
        .from("work_orders")
        .select(
          "id, action, status, priority, price, property_id, component_id, due_date, quarter, contractor, created_at, updated_at",
        )
        .in("property_id", propIds)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (payload.status) {
        wq = wq.eq("status", payload.status);
      } else {
        wq = wq.in("status", ["not_started", "awaiting_quote", "ordered"]);
      }

      const { data: orders, error: woErr } = await wq;
      if (woErr) {
        return json({ success: false, error: woErr.message }, 500);
      }

      const results = (orders ?? []).map((o) => ({
        ...o,
        property_name: propNameMap.get(o.property_id as string) ?? null,
      }));

      await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
      return json({
        success: true,
        type: "list_work_orders",
        count: results.length,
        results,
      });
    }

    // ============ list_high_risk_components (Weibull, Jarvis) ============
    if (payload.type === "list_high_risk_components") {
      if (
        !permissions.includes("list_components") &&
        !permissions.includes("read_components") &&
        !permissions.includes("create_work_order")
      ) {
        return json({ success: false, error: "API key missing list_components permission" }, 403);
      }

      const { data: props } = await supabase
        .from("properties")
        .select("id, name")
        .eq("organization_id", keyRow.organization_id);
      let propIds = (props ?? []).map((p) => p.id as string);
      const propNameMap = new Map((props ?? []).map((p) => [p.id as string, p.name as string]));

      if (payload.property_id) {
        if (!propIds.includes(payload.property_id)) {
          return json({ success: false, error: "property not in organization" }, 403);
        }
        propIds = [payload.property_id];
      } else if (payload.property_name) {
        const needle = payload.property_name.trim().toLowerCase();
        propIds = (props ?? [])
          .filter((p) => (p.name || "").toLowerCase().includes(needle))
          .map((p) => p.id as string);
      }

      if (!propIds.length) {
        return json({ success: true, type: "list_high_risk_components", count: 0, results: [] });
      }

      const { data: components } = await supabase
        .from("components")
        .select("id, name, type, installation_year, property_id")
        .in("property_id", propIds)
        .neq("status", "decommissioned")
        .limit(500);

      if (!components?.length) {
        return json({ success: true, type: "list_high_risk_components", count: 0, results: [] });
      }

      const ids = components.map((c) => c.id as string);
      const [purchaseRes, histRes] = await Promise.all([
        supabase
          .from("component_purchase_info")
          .select("component_id, expected_lifespan_years, purchase_date")
          .in("component_id", ids),
        supabase
          .from("maintenance_history")
          .select("component_id, performed_date, category")
          .in("component_id", ids),
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
          propertyName: propNameMap.get(c.property_id as string) ?? null,
          installationYear: (c.installation_year as number | null) ?? null,
          purchaseDate: (p?.purchase_date as string | null) ?? null,
          expectedLifespanYears: (p?.expected_lifespan_years as number | null) ?? null,
          history: histMap.get(c.id as string) ?? [],
        };
      });

      const batch = computeComponentRiskBatch(inputs);
      const minLevel = (payload.min_level as RiskLevel) || "high";
      const minConf = (payload.min_confidence as "low" | "medium" | "high") || "medium";
      const limit = Math.min(Math.max(payload.limit ?? 15, 1), 50);
      const filtered = filterRiskResults(batch, {
        minLevel,
        minConfidence: minConf,
        limit,
      });

      const results = filtered.map((r) => ({
        component_id: r.componentId,
        name: r.name,
        type: r.type,
        property_id: r.propertyId,
        property_name: r.propertyName,
        risk_level: r.riskLevel,
        risk_score: r.riskScore,
        confidence: r.confidence,
        remaining_b10_years: r.remainingB10Years,
        recommendation: r.recommendation,
        age_years: r.ageYears,
      }));

      await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
      return json({
        success: true,
        type: "list_high_risk_components",
        count: results.length,
        results,
      });
    }

    // ============ suggest_work_order (HITL pending action, Jarvis) ============
    if (payload.type === "suggest_work_order") {
      if (
        !permissions.includes("create_work_order") &&
        !permissions.includes("get_pending_actions")
      ) {
        return json(
          { success: false, error: "API key missing create_work_order permission" },
          403,
        );
      }
      if (!payload.action_text?.trim()) {
        return json({ success: false, error: "action_text is required" }, 400);
      }

      const conf =
        typeof payload.price_estimate === "string" && payload.price_estimate
          ? 0.75
          : 0.8;

      const actionText = payload.action_text.trim().slice(0, 140);
      const { data: suggestion, error: sugErr } = await supabase
        .from("ai_suggested_actions")
        .insert({
          organization_id: keyRow.organization_id,
          action_type: "create_work_order",
          status: "pending",
          confidence_score: conf,
          reasoning:
            payload.reasoning ||
            `Jarvis ingest-förslag (${payload.source || "jarvis_worker"})`,
          payload: {
            action: actionText,
            property_name: payload.property_name,
            property_id: payload.property_id,
            component_id: payload.component_id,
            component_name: payload.component_system,
            priority: mapPriority(payload.priority),
            price: parsePrice(payload.price_estimate),
            reasoning: payload.raw_context || payload.reasoning || actionText,
            confidence: conf,
            source: payload.source || "jarvis_ingest",
            report_filename: payload.report_filename,
          },
          source_document_type: "jarvis_ingest",
        })
        .select("id, status, action_type, created_at")
        .single();

      if (sugErr) {
        return json({ success: false, error: sugErr.message }, 500);
      }

      await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
      return json({
        success: true,
        type: "suggest_work_order",
        result: suggestion,
      });
    }

    // ============ get_property_overview (full property Q&A context) ============
    if (payload.type === "get_property_overview") {
      if (
        !permissions.includes("list_properties") &&
        !permissions.includes("list_components") &&
        !permissions.includes("read_components") &&
        !permissions.includes("create_work_order")
      ) {
        return json({ success: false, error: "API key missing property read permission" }, 403);
      }

      const nameQ = (payload.property_name || "").trim();
      const idQ = (payload.property_id || "").trim();
      if (!nameQ && !idQ) {
        return json({ success: false, error: "property_name or property_id required" }, 400);
      }

      let pq = supabase
        .from("properties")
        .select(
          "id, name, address, area_sqm, construction_year, property_type, property_number, description, invoice_address",
        )
        .eq("organization_id", keyRow.organization_id)
        .limit(1);
      if (idQ) pq = pq.eq("id", idQ);
      else pq = pq.ilike("name", `%${nameQ}%`);

      const { data: prop, error: propErr } = await pq.maybeSingle();
      if (propErr) return json({ success: false, error: propErr.message }, 500);
      if (!prop) return json({ success: false, error: "Fastighet hittades inte" }, 404);

      const pid = prop.id as string;

      const [
        compsRes,
        woRes,
        todoRes,
        notesRes,
        docsRes,
        planRes,
        contactsRes,
      ] = await Promise.all([
        supabase
          .from("components")
          .select("id, name, type, status, installation_year, manufacturer, model, serial_number, next_service_date")
          .eq("property_id", pid)
          .neq("status", "decommissioned")
          .order("name")
          .limit(200),
        supabase
          .from("work_orders")
          .select("id, action, status, priority, price, component_id, due_date, created_at")
          .eq("property_id", pid)
          .in("status", ["not_started", "awaiting_quote", "ordered"])
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("property_todos")
          .select("id, title, priority, due_date, completed")
          .eq("property_id", pid)
          .eq("completed", false)
          .limit(30),
        supabase
          .from("property_notes")
          .select("id, content, created_at")
          .eq("property_id", pid)
          .order("created_at", { ascending: false })
          .limit(15),
        supabase
          .from("property_documents")
          .select("id, name, mime_type, created_at, is_latest")
          .eq("property_id", pid)
          .order("created_at", { ascending: false })
          .limit(40),
        supabase
          .from("maintenance_plans")
          .select("id, name, start_year, start_quarter, horizon_years, status, generated_at, min_risk_level")
          .eq("property_id", pid)
          .eq("status", "active")
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("property_contacts")
          .select("id, name, role, email, phone")
          .eq("property_id", pid)
          .limit(20),
      ]);

      const components = compsRes.data ?? [];
      const ids = components.map((c) => c.id as string);

      // Risk top for this property
      let highRisk: Array<Record<string, unknown>> = [];
      if (ids.length) {
        const [purchaseRes, histRes] = await Promise.all([
          supabase
            .from("component_purchase_info")
            .select("component_id, expected_lifespan_years, purchase_date")
            .in("component_id", ids),
          supabase
            .from("maintenance_history")
            .select("component_id, performed_date, category")
            .in("component_id", ids),
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
            expectedLifespanYears: (p?.expected_lifespan_years as number | null) ?? null,
            history: histMap.get(c.id as string) ?? [],
          };
        });
        highRisk = filterRiskResults(computeComponentRiskBatch(inputs), {
          minLevel: "medium",
          minConfidence: "low",
          limit: 10,
        }).map((r) => ({
          component_id: r.componentId,
          name: r.name,
          type: r.type,
          risk_level: r.riskLevel,
          risk_score: r.riskScore,
          confidence: r.confidence,
          remaining_b10_years: r.remainingB10Years,
          recommendation: r.recommendation,
        }));
      }

      let planItemsCount = 0;
      let planCost: number | null = null;
      if (planRes.data?.id) {
        const { data: items } = await supabase
          .from("maintenance_plan_items")
          .select("estimated_cost")
          .eq("plan_id", planRes.data.id);
        planItemsCount = items?.length ?? 0;
        const known = (items ?? []).filter((i) => i.estimated_cost != null);
        if (known.length) {
          planCost = known.reduce((s, i) => s + Number(i.estimated_cost), 0);
        }
      }

      await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);

      return json({
        success: true,
        type: "get_property_overview",
        result: {
          property: prop,
          counts: {
            components: components.length,
            open_work_orders: (woRes.data ?? []).length,
            open_todos: (todoRes.data ?? []).length,
            notes: (notesRes.data ?? []).length,
            documents: (docsRes.data ?? []).length,
            high_risk: highRisk.length,
          },
          components: components.slice(0, 80),
          open_work_orders: woRes.data ?? [],
          open_todos: todoRes.data ?? [],
          notes: (notesRes.data ?? []).map((n) => ({
            id: n.id,
            created_at: n.created_at,
            excerpt: String(n.content || "").slice(0, 400),
          })),
          documents: docsRes.data ?? [],
          contacts: contactsRes.data ?? [],
          high_risk_components: highRisk,
          maintenance_plan: planRes.data
            ? {
                ...planRes.data,
                item_count: planItemsCount,
                estimated_total_cost: planCost,
              }
            : null,
        },
      });
    }

    // ============ search_property_documents (metadata + optional RAG) ============
    if (payload.type === "search_property_documents") {
      if (
        !permissions.includes("list_properties") &&
        !permissions.includes("list_components") &&
        !permissions.includes("read_components")
      ) {
        return json({ success: false, error: "API key missing read permission" }, 403);
      }
      const query = (payload.query || "").trim();
      if (!query) {
        return json({ success: false, error: "query required" }, 400);
      }

      const { data: props } = await supabase
        .from("properties")
        .select("id, name")
        .eq("organization_id", keyRow.organization_id);
      let propIds = (props ?? []).map((p) => p.id as string);
      const propNames = new Map((props ?? []).map((p) => [p.id as string, p.name as string]));

      if (payload.property_id) {
        propIds = propIds.filter((id) => id === payload.property_id);
      } else if (payload.property_name) {
        const needle = payload.property_name.trim().toLowerCase();
        propIds = (props ?? [])
          .filter((p) => (p.name || "").toLowerCase().includes(needle))
          .map((p) => p.id as string);
      }

      if (!propIds.length) {
        return json({ success: true, type: "search_property_documents", count: 0, results: [] });
      }

      const limit = Math.min(Math.max(payload.limit ?? 20, 1), 50);
      const { data: docs, error: docErr } = await supabase
        .from("property_documents")
        .select("id, property_id, name, mime_type, created_at, file_url, is_latest")
        .in("property_id", propIds)
        .order("created_at", { ascending: false })
        .limit(100);
      if (docErr) return json({ success: false, error: docErr.message }, 500);

      const q = query.toLowerCase();
      const filtered = (docs ?? [])
        .filter((d) => {
          const hay = `${d.name || ""} ${d.mime_type || ""}`.toLowerCase();
          return hay.includes(q) || q.split(/\s+/).some((w) => w.length > 2 && hay.includes(w));
        })
        .slice(0, limit)
        .map((d) => ({
          id: d.id,
          property_id: d.property_id,
          name: d.name,
          mime_type: d.mime_type,
          created_at: d.created_at,
          is_latest: d.is_latest,
          property_name: propNames.get(d.property_id as string) ?? null,
        }));

      // Optional semantic hits if RPC available
      let semantic: Array<Record<string, unknown>> = [];
      try {
        const apiKey = Deno.env.get("GOOGLE_AI_API_KEY") || Deno.env.get("GEMINI_API_KEY") || "";
        if (apiKey && query.length >= 3) {
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
          if (embResp.ok) {
            const embData = await embResp.json();
            const values = embData.embedding?.values || [];
            if (values.length) {
              const { data: hits } = await supabase.rpc("semantic_search_ranked", {
                query_embedding: JSON.stringify(values),
                match_threshold: 0.28,
                match_count: Math.min(limit, 8),
                org_id: keyRow.organization_id,
                filter_tables: ["property_documents"],
                boost_recent: true,
                boost_popular: false,
              });
              semantic = (hits || []).map((h: {
                source_id?: string;
                content?: string;
                similarity?: number;
              }) => ({
                source_id: h.source_id,
                similarity: h.similarity,
                excerpt: (h.content || "").substring(0, 1200),
              }));
            }
          }
        }
      } catch {
        // semantic optional
      }

      await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRow.id);
      return json({
        success: true,
        type: "search_property_documents",
        count: filtered.length,
        results: filtered,
        semantic_hits: semantic,
        note:
          semantic.length === 0
            ? "Semantisk sökning tom eller ej indexerad — metadata-träffar visas. Ladda upp/indexera dokument i appen för RAG."
            : undefined,
      });
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
        source_document_type: "jarvis_webhook",
        status: "executed",
        executed_at: new Date().toISOString(),
        execution_result: mh as Record<string, unknown>,
        confidence_score: 1.0,
        reasoning: "Logged via Jarvis agent webhook",
      });

      return json({ success: true, type: "log_service", result: mh });
    }

    // ============ todo / work_order (existing behavior) ============
    // Guard: unknown types must not fall through to write path with misleading errors
    if (payload.type && payload.type !== "todo" && payload.type !== "work_order") {
      return json(
        {
          success: false,
          error: `Unhandled type '${payload.type}'. Deploy latest jarvis-webhook (or crewai-webhook alias).`,
        },
        400,
      );
    }
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
      source_document_type: "jarvis_webhook",
      status: "executed",
      executed_at: new Date().toISOString(),
      execution_result: created,
      confidence_score: 1.0,
      reasoning: "Created via Jarvis agent webhook",
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
    console.error("jarvis-webhook error:", err);
    return json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});
