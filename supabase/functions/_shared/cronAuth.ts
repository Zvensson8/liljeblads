import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqual } from "./requireUser.ts";

/**
 * Shared auth for cron / internal jobs that run with verify_jwt = false.
 * Requires CRON_SECRET env (set via `supabase secrets set CRON_SECRET=...`).
 *
 * Accepts either:
 * - Header: x-cron-secret: <secret>
 * - Header: Authorization: Bearer <CRON_SECRET>
 */
export function assertCronAuthorized(req: Request): Response | null {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected || expected.length < 16) {
    console.error("CRON_SECRET is missing or too short (min 16 chars)");
    return new Response(
      JSON.stringify({ error: "Server misconfigured: CRON_SECRET" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const headerSecret = req.headers.get("x-cron-secret");
  const auth = req.headers.get("Authorization");
  const bearer =
    auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;

  // Prefer explicit cron header; only treat bearer as secret if it matches
  if (headerSecret && timingSafeEqual(headerSecret, expected)) return null;
  if (bearer && timingSafeEqual(bearer, expected)) return null;

  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Cron secret OR logged-in founder/admin (for dashboard "Process" / "Backfill" buttons).
 */
export async function assertCronOrAdminAuthorized(
  req: Request,
): Promise<Response | null> {
  // Fast path: cron secret
  const cronDenied = assertCronAuthorized(req);
  if (cronDenied === null) return null;

  // JWT path: founder or admin
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return cronDenied;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Validate user JWT
  const userClient = createClient(supabaseUrl, anonKey ?? serviceKey, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return cronDenied;
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);

  const ok = (roles ?? []).some(
    (r: { role: string }) => r.role === "founder" || r.role === "admin",
  );
  if (!ok) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return null;
}

export const cronCorsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
