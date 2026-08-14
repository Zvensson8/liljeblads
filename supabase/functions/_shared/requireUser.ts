import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type AuthedUser = {
  id: string;
  email: string | null;
};

/** Constant-time string compare to avoid leaking secret length/content via timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  const len = Math.max(left.length, right.length);
  let mismatch = left.length === right.length ? 0 : 1;
  for (let i = 0; i < len; i++) {
    mismatch |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return mismatch === 0;
}

function jsonError(
  status: number,
  error: string,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export async function requireUser(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<{ user: AuthedUser } | { response: Response }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { response: jsonError(401, "Authorization required", corsHeaders) };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !anonKey) {
    return { response: jsonError(503, "Server misconfigured", corsHeaders) };
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user?.id) {
    return { response: jsonError(401, "Session expired. Please log in again.", corsHeaders) };
  }

  return {
    user: { id: data.user.id, email: data.user.email ?? null },
  };
}

/** User JWT (verified via auth.getUser) or the raw service-role key. Never trust JWT payload.role. */
export async function requireUserOrServiceRole(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<
  | { kind: "user"; user: AuthedUser }
  | { kind: "service" }
  | { response: Response }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { response: jsonError(401, "Authorization required", corsHeaders) };
  }
  const token = authHeader.slice("Bearer ".length).trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (serviceKey && timingSafeEqual(token, serviceKey)) {
    return { kind: "service" };
  }
  const userResult = await requireUser(req, corsHeaders);
  if ("response" in userResult) return userResult;
  return { kind: "user", user: userResult.user };
}

export async function assertOrgMember(
  admin: SupabaseClient,
  userId: string,
  orgId: string | null | undefined,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (!orgId) {
    return jsonError(403, "Forbidden", corsHeaders);
  }

  const { data: member } = await admin
    .from("organization_members")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (member) return null;

  const { data: founder } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "founder")
    .maybeSingle();
  if (founder) return null;

  return jsonError(403, "Forbidden", corsHeaders);
}

export function serviceRoleClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}
