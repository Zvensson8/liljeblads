import { supabase } from "@/integrations/supabase/client";

/** Fire-and-forget: WO completed → EnergyPulse marks the linked action done. */
export async function notifyEnergyPulseWorkOrderCompleted(input: {
  workOrderId: string;
  propertyId: string | null;
}): Promise<void> {
  if (!input.propertyId) return;

  const { data: prop } = await supabase
    .from("properties")
    .select("organization_id")
    .eq("id", input.propertyId)
    .maybeSingle();
  const orgId = prop?.organization_id;
  if (!orgId) return;

  const { data: settings } = await (supabase as any)
    .from("organization_jarvis_settings")
    .select("energypulse_base_url, energypulse_bridge_secret")
    .eq("organization_id", orgId)
    .maybeSingle();

  const baseUrl = String(settings?.energypulse_base_url ?? "")
    .trim()
    .replace(/\/$/, "");
  const secret = String(settings?.energypulse_bridge_secret ?? "").trim();
  if (!baseUrl || !secret) return;

  const res = await fetch(`${baseUrl}/api/bridge/work-order-completed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ work_order_id: input.workOrderId }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(
      "[notifyEnergyPulse] work-order-completed",
      res.status,
      text.slice(0, 200),
    );
  }
}

async function energyPulseSettings(propertyId: string): Promise<{
  baseUrl: string;
  secret: string;
} | null> {
  const { data: prop } = await supabase
    .from("properties")
    .select("organization_id")
    .eq("id", propertyId)
    .maybeSingle();
  const orgId = prop?.organization_id;
  if (!orgId) return null;

  const { data: settings } = await (supabase as any)
    .from("organization_jarvis_settings")
    .select("energypulse_base_url, energypulse_bridge_secret")
    .eq("organization_id", orgId)
    .maybeSingle();

  const baseUrl = String(settings?.energypulse_base_url ?? "")
    .trim()
    .replace(/\/$/, "");
  const secret = String(settings?.energypulse_bridge_secret ?? "").trim();
  if (!baseUrl || !secret) return null;
  return { baseUrl, secret };
}

/** Fire-and-forget: edited plan item → EnergyPulse action fields. */
export async function notifyEnergyPulsePlanItemUpdated(input: {
  propertyId: string;
  planItemId: string;
  actionId: string;
  title: string;
  notes: string | null;
  plannedYear: number;
  plannedQuarter: number;
  investmentCost: number | null;
}): Promise<void> {
  const cfg = await energyPulseSettings(input.propertyId);
  if (!cfg) return;

  const res = await fetch(`${cfg.baseUrl}/api/bridge/plan-item-updated`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.secret}`,
    },
    body: JSON.stringify({
      plan_item_id: input.planItemId,
      action_id: input.actionId,
      title: input.title,
      notes: input.notes,
      planned_year: input.plannedYear,
      planned_quarter: input.plannedQuarter,
      investment_cost: input.investmentCost,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(
      "[notifyEnergyPulse] plan-item-updated",
      res.status,
      text.slice(0, 200),
    );
  }
}

export async function notifyEnergyPulsePlanItemRemoved(input: {
  propertyId: string;
  planItemId: string;
  actionId: string;
}): Promise<void> {
  const cfg = await energyPulseSettings(input.propertyId);
  if (!cfg) return;

  const res = await fetch(`${cfg.baseUrl}/api/bridge/plan-item-updated`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.secret}`,
    },
    body: JSON.stringify({
      plan_item_id: input.planItemId,
      action_id: input.actionId,
      removed: true,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn(
      "[notifyEnergyPulse] plan-item-removed",
      res.status,
      text.slice(0, 200),
    );
  }
}
