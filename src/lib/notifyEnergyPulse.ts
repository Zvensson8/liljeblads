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

  const { data: settings } = await supabase
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
