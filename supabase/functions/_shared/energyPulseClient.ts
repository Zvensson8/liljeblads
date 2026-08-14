import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type EnergyPulseOverview = {
  configured: boolean;
  linked?: boolean;
  error?: string;
  name?: string | null;
  municipality?: string | null;
  climate_zone?: string | null;
  buildings?: unknown[];
  physical_risks?: unknown[];
};

export async function resolveEnergyPulseConfig(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ baseUrl: string; secret: string } | null> {
  const { data } = await supabase
    .from("organization_jarvis_settings")
    .select("energypulse_base_url, energypulse_bridge_secret")
    .eq("organization_id", orgId)
    .maybeSingle();

  const baseUrl = String(
    data?.energypulse_base_url || Deno.env.get("ENERGYPULSE_BASE_URL") || "",
  ).trim().replace(/\/$/, "");
  const secret = String(
    data?.energypulse_bridge_secret ||
      Deno.env.get("ENERGYPULSE_BRIDGE_SECRET") ||
      "",
  ).trim();

  if (!baseUrl || !secret) return null;
  return { baseUrl, secret };
}

export async function fetchEnergyPulseOverview(
  supabase: SupabaseClient,
  orgId: string,
  liljebladsPropertyId: string,
): Promise<EnergyPulseOverview> {
  const cfg = await resolveEnergyPulseConfig(supabase, orgId);
  if (!cfg) return { configured: false };

  try {
    const res = await fetch(`${cfg.baseUrl}/api/bridge/energy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.secret}`,
      },
      body: JSON.stringify({ liljeblads_property_id: liljebladsPropertyId }),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !json) {
      return {
        configured: true,
        error: json?.error ? String(json.error) : `EnergyPulse ${res.status}`,
      };
    }
    return {
      configured: true,
      linked: Boolean(json.linked),
      name: (json.name as string | null) ?? null,
      municipality: (json.municipality as string | null) ?? null,
      climate_zone: (json.climate_zone as string | null) ?? null,
      buildings: Array.isArray(json.buildings) ? json.buildings : [],
      physical_risks: Array.isArray(json.physical_risks) ? json.physical_risks : [],
    };
  } catch (e) {
    return {
      configured: true,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
