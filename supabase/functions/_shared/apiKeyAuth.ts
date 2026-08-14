import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ApiKeyCaller = {
  keyId: string;
  orgId: string;
  userId: string | null;
  permissions: string[];
  supabase: SupabaseClient;
};

export async function hashApiKey(key: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function extractApiKey(req: Request): string {
  const auth = req.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return (req.headers.get("x-api-key") ?? "").trim();
}

export async function resolveApiKeyCaller(
  req: Request,
): Promise<
  { ok: true; caller: ApiKeyCaller } | { ok: false; status: number; error: string }
> {
  const apiKey = extractApiKey(req);
  if (!apiKey.startsWith("lbl_")) {
    return { ok: false, status: 401, error: "Saknar API-nyckel (lbl_…)." };
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const keyHash = await hashApiKey(apiKey);
  const { data: keyRow, error } = await supabase
    .from("api_keys")
    .select("id, organization_id, permissions, is_active, expires_at, created_by")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error || !keyRow || !keyRow.is_active) {
    return { ok: false, status: 401, error: "Ogiltig API-nyckel." };
  }
  if (keyRow.expires_at && new Date(keyRow.expires_at) < new Date()) {
    return { ok: false, status: 401, error: "API-nyckeln har gått ut." };
  }

  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", keyRow.id);

  return {
    ok: true,
    caller: {
      keyId: keyRow.id as string,
      orgId: keyRow.organization_id as string,
      userId: (keyRow.created_by as string | null) ?? null,
      permissions: Array.isArray(keyRow.permissions)
        ? (keyRow.permissions as string[])
        : [],
      supabase,
    },
  };
}
