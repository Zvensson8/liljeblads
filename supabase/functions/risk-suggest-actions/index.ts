/**
 * Cron / admin: generate HITL work-order suggestions from Weibull risk.
 * Never creates work orders directly — only ai_suggested_actions.
 *
 * Auth: x-cron-secret or founder/admin JWT (assertCronOrAdminAuthorized)
 * Schedule suggestion: daily e.g. 0 6 * * * (06:00 UTC)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  assertCronOrAdminAuthorized,
  cronCorsHeaders,
} from "../_shared/cronAuth.ts";
import {
  computeComponentRiskBatch,
  filterRiskResults,
  type ComponentRiskInput,
  type ComponentRiskResult,
} from "../_shared/componentRisk.ts";
import { getResendClient, resendFrom } from "../_shared/resendClient.ts";

const corsHeaders = cronCorsHeaders;
const DEDUPE_DAYS = 30;
const DEFAULT_MAX = 20;

type OrgPolicy = {
  risk_suggest_enabled: boolean;
  min_risk_level: "low" | "medium" | "high" | "critical";
  min_confidence: "low" | "medium" | "high";
  included_component_types: string[] | null;
  excluded_component_types: string[] | null;
  max_suggestions_per_run: number;
};

function confidenceScore(c: ComponentRiskResult["confidence"]): number {
  if (c === "high") return 0.85;
  if (c === "medium") return 0.7;
  return 0.45;
}

function typeAllowed(
  t: string | null | undefined,
  policy: OrgPolicy,
): boolean {
  const type = t || "";
  if ((policy.excluded_component_types || []).includes(type)) return false;
  if (policy.included_component_types == null) return true;
  if (policy.included_component_types.length === 0) return false;
  return policy.included_component_types.includes(type);
}

async function loadPolicy(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<OrgPolicy> {
  const { data } = await supabase
    .from("organization_agent_policies")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();
  return {
    risk_suggest_enabled: data?.risk_suggest_enabled ?? true,
    min_risk_level: (data?.min_risk_level as OrgPolicy["min_risk_level"]) ??
      "high",
    min_confidence: (data?.min_confidence as OrgPolicy["min_confidence"]) ??
      "medium",
    included_component_types: data?.included_component_types ?? null,
    excluded_component_types: data?.excluded_component_types ?? [],
    max_suggestions_per_run: data?.max_suggestions_per_run ?? DEFAULT_MAX,
  };
}

async function notifyOrgAdminsOfSuggestions(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  created: number,
  topActions: Array<{ action: string; component?: string; risk?: string }>,
): Promise<boolean> {
  if (created <= 0) return false;
  const resend = getResendClient();
  if (!resend) return false;

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();

  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", orgId)
    .in("role", ["owner", "admin"]);
  const userIds = (members ?? []).map((m) => m.user_id as string);
  if (!userIds.length) return false;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("email")
    .in("id", userIds);
  const recipients = [
    ...new Set(
      (profiles ?? [])
        .map((p) => (p.email as string | null) || "")
        .filter((e) => e.includes("@")),
    ),
  ];
  if (!recipients.length) return false;

  const appUrl = Deno.env.get("PUBLIC_APP_URL") || "https://liljeblads.vercel.app";
  const orgName = (org?.name as string) || "organisationen";
  const lines = topActions
    .slice(0, 8)
    .map(
      (a, i) =>
        `${i + 1}. ${a.action}${a.component ? ` (${a.component})` : ""}${
          a.risk ? ` — risk ${a.risk}` : ""
        }`,
    )
    .join("\n");

  const html = `
    <div style="font-family:system-ui,sans-serif;line-height:1.5;max-width:560px">
      <h2 style="margin:0 0 8px">Nya riskförslag – ${orgName}</h2>
      <p>Risk-grafen skapade <strong>${created}</strong> förslag som väntar på granskning (HITL).</p>
      <pre style="background:#f6f6f6;padding:12px;border-radius:8px;white-space:pre-wrap">${lines || "—"}</pre>
      <p><a href="${appUrl}/agent">Öppna agent-aktivitet</a> eller dashboard för att godkänna/avvisa.</p>
    </div>`;

  await resend.emails.send({
    from: resendFrom(),
    to: recipients,
    subject: `Liljeblads: ${created} nya riskförslag (${orgName})`,
    html,
  });
  return true;
}

async function processOrg(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<{
  orgId: string;
  created: number;
  skipped: number;
  scanned: number;
  snapshots: number;
  notified?: boolean;
}> {
  const policy = await loadPolicy(supabase, orgId);
  if (!policy.risk_suggest_enabled) {
    return { orgId, created: 0, skipped: 0, scanned: 0, snapshots: 0 };
  }

  const maxPerOrg = policy.max_suggestions_per_run || DEFAULT_MAX;

  const { data: props } = await supabase
    .from("properties")
    .select("id, name")
    .eq("organization_id", orgId);
  const propIds = (props ?? []).map((p) => p.id as string);
  const propNames = new Map(
    (props ?? []).map((p) => [p.id as string, p.name as string]),
  );
  if (!propIds.length) {
    return { orgId, created: 0, skipped: 0, scanned: 0, snapshots: 0 };
  }

  const { data: components } = await supabase
    .from("components")
    .select("id, name, type, installation_year, property_id")
    .in("property_id", propIds)
    .neq("status", "decommissioned");
  if (!components?.length) {
    return { orgId, created: 0, skipped: 0, scanned: 0, snapshots: 0 };
  }

  const ids = components.map((c) => c.id as string);
  const [purchaseRes, histRes, priceRes, planRes] = await Promise.all([
    supabase
      .from("component_purchase_info")
      .select("component_id, expected_lifespan_years, purchase_date, purchase_cost")
      .in("component_id", ids),
    supabase
      .from("maintenance_history")
      .select("component_id, performed_date, category")
      .in("component_id", ids),
    supabase
      .from("component_unit_prices")
      .select("component_type, replacement_cost")
      .eq("organization_id", orgId)
      .eq("is_active", true),
    supabase
      .from("maintenance_plan_items")
      .select("component_id, status, maintenance_plans!inner(status, property_id)")
      .in("component_id", ids)
      .eq("maintenance_plans.status", "active"),
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
      propertyName: propNames.get(c.property_id as string) ?? null,
      installationYear: (c.installation_year as number | null) ?? null,
      purchaseDate: (p?.purchase_date as string | null) ?? null,
      expectedLifespanYears:
        (p?.expected_lifespan_years as number | null) ?? null,
      history: histMap.get(c.id as string) ?? [],
    };
  });

  const batch = computeComponentRiskBatch(inputs);

  // Snapshots for history (cron point-in-time, top risks only to limit volume)
  let snapshots = 0;
  try {
    const topForSnap = filterRiskResults(batch, {
      minLevel: "medium",
      limit: 30,
    });
    if (topForSnap.length) {
      const rows = topForSnap.map((r) => ({
        component_id: r.componentId,
        organization_id: orgId,
        risk_score: r.riskScore,
        risk_level: r.riskLevel,
        confidence: r.confidence,
        recommendation: r.recommendation,
        trigger_source: "cron",
        metadata: { age_years: r.ageYears, acute_count: r.acuteCount },
      }));
      const { error: snapErr } = await supabase
        .from("component_risk_snapshots")
        .insert(rows);
      if (!snapErr) snapshots = rows.length;
    }
  } catch (e) {
    console.warn("snapshot insert failed", e);
  }

  let risks = filterRiskResults(batch, {
    minLevel: policy.min_risk_level,
    minConfidence: policy.min_confidence,
    limit: maxPerOrg * 3,
  });
  risks = risks.filter((r) => typeAllowed(r.type, policy));

  if (!risks.length) {
    return {
      orgId,
      created: 0,
      skipped: 0,
      scanned: components.length,
      snapshots,
    };
  }

  const componentIds = risks.map((r) => r.componentId);
  const since = new Date();
  since.setDate(since.getDate() - DEDUPE_DAYS);

  const [openWoRes, pendingRes] = await Promise.all([
    supabase
      .from("work_orders")
      .select("component_id, status")
      .in("component_id", componentIds)
      .in("status", ["not_started", "awaiting_quote", "ordered"]),
    supabase
      .from("ai_suggested_actions")
      .select("id, payload, status, created_at")
      .eq("organization_id", orgId)
      .eq("action_type", "create_work_order")
      .in("status", ["pending", "approved"])
      .gte("created_at", since.toISOString()),
  ]);

  const PLAN_COST_THRESHOLD_SEK = 75_000;
  const purchaseCostById = new Map<string, number>();
  for (const p of purchaseRes.data ?? []) {
    if (p.purchase_cost != null) {
      purchaseCostById.set(p.component_id as string, Number(p.purchase_cost));
    }
  }
  const unitByType = new Map<string, number>();
  for (const row of priceRes.data ?? []) {
    const t = String(row.component_type ?? "");
    const cost = Number(row.replacement_cost);
    if (!t || !Number.isFinite(cost)) continue;
    unitByType.set(t, cost);
    unitByType.set(t.trim().toLowerCase(), cost);
  }
  const onActivePlan = new Set(
    (planRes.data ?? [])
      .map((r) => r.component_id as string | null)
      .filter(Boolean) as string[],
  );

  function estimateCost(componentId: string, type: string | null | undefined): number | null {
    const t = (type ?? "").trim();
    if (t && unitByType.has(t)) return unitByType.get(t) ?? null;
    if (t && unitByType.has(t.toLowerCase())) return unitByType.get(t.toLowerCase()) ?? null;
    if (purchaseCostById.has(componentId)) return purchaseCostById.get(componentId) ?? null;
    return null;
  }

  const openWo = new Set(
    (openWoRes.data ?? [])
      .map((w) => w.component_id as string | null)
      .filter(Boolean) as string[],
  );
  const pendingComponents = new Set<string>();
  for (const row of pendingRes.data ?? []) {
    const payload = row.payload as {
      component_id?: string;
      source?: string;
    } | null;
    if (payload?.component_id && payload?.source === "weibull_risk") {
      pendingComponents.add(payload.component_id);
    }
  }

  let skipped = 0;
  const toInsert: Array<Record<string, unknown>> = [];

  for (const risk of risks) {
    if (toInsert.length >= maxPerOrg) break;
    if (openWo.has(risk.componentId) || pendingComponents.has(risk.componentId)) {
      skipped += 1;
      continue;
    }
    if (onActivePlan.has(risk.componentId)) {
      skipped += 1;
      continue;
    }
    const est = estimateCost(risk.componentId, risk.type);
    // ≥ 75 tkr or unknown cost → underhållsplan, not WO
    if (est == null || !Number.isFinite(est) || est >= PLAN_COST_THRESHOLD_SEK) {
      skipped += 1;
      continue;
    }
    const conf = confidenceScore(risk.confidence);
    if (conf < 0.5) {
      skipped += 1;
      continue;
    }
    const actionText = (
      risk.recommendation ||
      `Förebyggande åtgärd för ${risk.name || risk.componentId}`
    ).slice(0, 140);

    toInsert.push({
      organization_id: orgId,
      action_type: "create_work_order",
      status: "pending",
      confidence_score: conf,
      reasoning:
        `Prediktiv risk ${risk.riskScore} (${risk.riskLevel}, confidence ${risk.confidence}) [cron]`,
      payload: {
        action: actionText,
        property_name: risk.propertyName || undefined,
        component_id: risk.componentId,
        component_name: risk.name,
        priority: risk.riskLevel === "critical" ? "high" : "medium",
        reasoning: `Weibull-baserad prediktiv risk (cron). ${risk.recommendation}`,
        confidence: conf,
        source: "weibull_risk",
      },
    });
  }

  if (!toInsert.length) {
    return {
      orgId,
      created: 0,
      skipped,
      scanned: components.length,
      snapshots,
    };
  }

  const { data, error } = await supabase
    .from("ai_suggested_actions")
    .insert(toInsert)
    .select("id");
  if (error) throw error;

  const created = data?.length ?? 0;
  let notified = false;
  try {
    notified = await notifyOrgAdminsOfSuggestions(
      supabase,
      orgId,
      created,
      toInsert.map((row) => {
        const p = row.payload as {
          action?: string;
          component_name?: string;
        };
        const reasoning = String(row.reasoning || "");
        const riskMatch = reasoning.match(/risk\s+(\d+)/i);
        return {
          action: p.action || "Åtgärd",
          component: p.component_name,
          risk: riskMatch?.[1],
        };
      }),
    );
  } catch (e) {
    console.warn("risk notify failed", e);
  }

  return {
    orgId,
    created,
    skipped,
    scanned: components.length,
    snapshots,
    notified,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const unauthorized = await assertCronOrAdminAuthorized(req);
  if (unauthorized) return unauthorized;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let body: { organization_id?: string } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    let orgIds: string[] = [];
    if (body.organization_id) {
      orgIds = [body.organization_id];
    } else {
      const { data: orgs, error } = await supabase
        .from("organizations")
        .select("id")
        .limit(100);
      if (error) throw error;
      orgIds = (orgs ?? []).map((o) => o.id as string);
    }

    const results = [];
    for (const orgId of orgIds) {
      try {
        results.push(await processOrg(supabase, orgId));
      } catch (e) {
        results.push({
          orgId,
          error: e instanceof Error ? e.message : String(e),
          created: 0,
          skipped: 0,
          scanned: 0,
        });
      }
    }

    const totalCreated = results.reduce(
      (s, r) => s + ((r as { created?: number }).created || 0),
      0,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        totalCreated,
        orgs: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("risk-suggest-actions error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
