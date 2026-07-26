/**
 * When a work order is completed, register cost on the linked component
 * via maintenance_history (final cost or proposed price).
 */
import { supabase } from "@/integrations/supabase/client";

export interface CompleteWorkOrderParams {
  workOrderId: string;
  /** Final cost; if null/undefined, use work order price */
  finalCost?: number | null;
  /** Optional override date YYYY-MM-DD */
  performedDate?: string;
}

export interface CompleteWorkOrderResult {
  workOrder: {
    id: string;
    status: string;
    price: number | null;
    component_id: string | null;
    action: string;
  };
  maintenanceHistoryId: string | null;
  costRegistered: number | null;
}

export async function completeWorkOrderWithCost(
  params: CompleteWorkOrderParams,
): Promise<CompleteWorkOrderResult> {
  const { workOrderId, finalCost, performedDate } = params;

  const { data: wo, error: fetchErr } = await supabase
    .from("work_orders")
    .select("id, action, status, price, component_id, contractor, comments, property_id")
    .eq("id", workOrderId)
    .single();

  if (fetchErr || !wo) {
    throw new Error(fetchErr?.message || "Arbetsorder hittades inte");
  }

  const proposed =
    wo.price != null && !Number.isNaN(Number(wo.price)) ? Number(wo.price) : null;
  const cost =
    finalCost !== undefined && finalCost !== null && !Number.isNaN(Number(finalCost))
      ? Number(finalCost)
      : proposed;

  const { data: updated, error: updErr } = await supabase
    .from("work_orders")
    .update({
      status: "completed",
      price: cost,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workOrderId)
    .select("id, status, price, component_id, action")
    .single();

  if (updErr || !updated) {
    throw new Error(updErr?.message || "Kunde inte uppdatera arbetsorder");
  }

  let maintenanceHistoryId: string | null = null;

  if (updated.component_id) {
    // Avoid duplicate MH for same WO
    const { data: existing } = await supabase
      .from("maintenance_history")
      .select("id")
      .eq("work_order_id", workOrderId)
      .maybeSingle();

    if (existing?.id) {
      const { data: mh, error: mhUpd } = await supabase
        .from("maintenance_history")
        .update({
          cost,
          action_type: wo.action,
          supplier: wo.contractor,
          notes: wo.comments,
          performed_date: performedDate || new Date().toISOString().split("T")[0],
        })
        .eq("id", existing.id)
        .select("id")
        .single();
      if (mhUpd) throw new Error(mhUpd.message);
      maintenanceHistoryId = mh?.id ?? existing.id;
    } else {
      const { data: mh, error: mhIns } = await supabase
        .from("maintenance_history")
        .insert({
          component_id: updated.component_id,
          action_type: wo.action,
          performed_date: performedDate || new Date().toISOString().split("T")[0],
          supplier: wo.contractor,
          cost,
          notes: wo.comments,
          category: "planned",
          work_order_id: workOrderId,
        })
        .select("id")
        .single();
      if (mhIns) throw new Error(mhIns.message);
      maintenanceHistoryId = mh?.id ?? null;
    }
  }

  return {
    workOrder: updated,
    maintenanceHistoryId,
    costRegistered: cost,
  };
}
