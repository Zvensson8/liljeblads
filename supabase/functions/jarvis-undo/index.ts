/**
 * Quick undo of a Jarvis action (5 min window) without full chat round-trip.
 * Auth: user JWT (must own the action).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { undoActionById, undoLastAction } from "../_shared/jarvisUndo.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await authClient.auth.getUser(
      token,
    );
    if (userError || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Session expired" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const rate = await checkRateLimit(userId, {
      endpoint: "jarvis-undo",
      maxRequests: 20,
      windowSeconds: 60,
    });
    const limited = rateLimitResponse(rate, corsHeaders);
    if (limited) return limited;

    const body = await req.json().catch(() => ({}));
    const actionLogId = String(body.action_log_id || "").trim();

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id, active_organization_id")
      .eq("id", userId)
      .single();

    let orgId =
      (profile as { active_organization_id?: string | null } | null)
        ?.active_organization_id ||
      profile?.organization_id ||
      null;
    if (!orgId) {
      const { data: m } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
      orgId = m?.organization_id ?? null;
    }
    if (!orgId) {
      return new Response(JSON.stringify({ error: "Ingen organisation" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ctx = { supabase, orgId, userId };
    const result = actionLogId
      ? await undoActionById(ctx, actionLogId)
      : await undoLastAction(ctx);

    const status = result.error && !result.undone ? 400 : 200;
    return new Response(JSON.stringify(result), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
