import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type JarvisCaller = {
  userId: string;
  userEmail: string | null;
  orgId: string;
  memberRole: string | null;
  supabase: SupabaseClient;
};

export async function resolveJarvisCaller(
  req: Request,
): Promise<{ ok: true; caller: JarvisCaller } | { ok: false; status: number; error: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Authorization header required" };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  if (userError || !userData?.user?.id) {
    return { ok: false, status: 401, error: "Session expired. Please log in again." };
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const userId = userData.user.id;

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
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    orgId = membership?.organization_id ?? null;
  }

  if (!orgId) {
    return {
      ok: false,
      status: 403,
      error: "Ingen organisation hittades för din användare.",
    };
  }

  const { data: memberRow } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();

  let memberRole: string | null = (memberRow?.role as string) || null;
  if (!memberRow) {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "founder")
      .maybeSingle();
    if (!roles) {
      return {
        ok: false,
        status: 403,
        error: "Du är inte medlem i den aktiva organisationen.",
      };
    }
    memberRole = "founder";
  }

  return {
    ok: true,
    caller: {
      userId,
      userEmail: userData.user.email ?? null,
      orgId,
      memberRole,
      supabase,
    },
  };
}
