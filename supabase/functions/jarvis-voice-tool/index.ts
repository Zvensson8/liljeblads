import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { resolveJarvisCaller } from "../_shared/resolveJarvisCaller.ts";
import { executeJarvisTool } from "../_shared/jarvisTools.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resolved = await resolveJarvisCaller(req);
    if (!resolved.ok) return json({ error: resolved.error }, resolved.status);
    const { caller } = resolved;

    const limited = await checkRateLimit(caller.userId, {
      endpoint: "jarvis-voice-tool",
      maxRequests: 40,
      windowSeconds: 60,
    });
    const blocked = rateLimitResponse(limited, corsHeaders);
    if (blocked) return blocked;

    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) return json({ error: "name krävs" }, 400);

    let args: Record<string, unknown> = {};
    if (body?.arguments && typeof body.arguments === "object") {
      args = body.arguments as Record<string, unknown>;
    } else if (typeof body?.arguments === "string") {
      try {
        args = JSON.parse(body.arguments) as Record<string, unknown>;
      } catch {
        return json({ error: "ogiltiga arguments" }, 400);
      }
    }

    const pageContext =
      body?.pageContext && typeof body.pageContext === "object"
        ? {
            property_id: body.pageContext.property_id,
            project_id: body.pageContext.project_id,
            component_id: body.pageContext.component_id,
            path: body.pageContext.path,
          }
        : null;

    const result = await executeJarvisTool(name, args, {
      supabase: caller.supabase,
      orgId: caller.orgId,
      userId: caller.userId,
      userEmail: caller.userEmail,
      memberRole: caller.memberRole,
      pageContext,
    });

    return json({ result });
  } catch (e) {
    console.error("[jarvis-voice-tool]", e);
    return json({ error: "Verktygsfel" }, 500);
  }
});
