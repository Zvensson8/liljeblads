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

async function processOrg(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
): Promise<{ orgId: string; created: number; skipped: number; scanned: number; snapshots: number }> {
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

  return {
    orgId,
    created: data?.length ?? 0,
    skipped,
    scanned: components.length,
    snapshots,
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
