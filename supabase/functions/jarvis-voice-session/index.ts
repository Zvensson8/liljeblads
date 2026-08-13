import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { resolveJarvisCaller } from "../_shared/resolveJarvisCaller.ts";
import {
  voiceAgentInstructions,
  voiceAgentTools,
} from "../_shared/voiceAgentTools.ts";

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

function extractClientSecret(payload: Record<string, unknown>): string | null {
  if (typeof payload.value === "string" && payload.value) return payload.value;
  const nested = payload.client_secret;
  if (typeof nested === "string" && nested) return nested;
  if (nested && typeof nested === "object") {
    const v = (nested as { value?: unknown }).value;
    if (typeof v === "string" && v) return v;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const key = (Deno.env.get("XAI_API_KEY") || "").trim();
    if (!key) {
      return json({ error: "XAI_API_KEY saknas — Voice Agent är inte konfigurerad." }, 500);
    }

    const resolved = await resolveJarvisCaller(req);
    if (!resolved.ok) return json({ error: resolved.error }, resolved.status);

    const { caller } = resolved;
    const limited = await checkRateLimit(caller.userId, {
      endpoint: "jarvis-voice-session",
      maxRequests: 12,
      windowSeconds: 60,
    });
    const blocked = rateLimitResponse(limited, corsHeaders);
    if (blocked) return blocked;

    const body = await req.json().catch(() => ({}));
    const pageLabel =
      typeof body?.pageLabel === "string" ? body.pageLabel.trim() : "";

    const { data: org } = await caller.supabase
      .from("organizations")
      .select("name")
      .eq("id", caller.orgId)
      .maybeSingle();

    const xai = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
    });

    const payload = (await xai.json().catch(() => ({}))) as Record<string, unknown>;
    if (!xai.ok) {
      console.error("[jarvis-voice-session] xAI", xai.status, payload);
      return json({ error: "Kunde inte starta Grok Voice just nu." }, 502);
    }

    const clientSecret = extractClientSecret(payload);
    if (!clientSecret) {
      console.error("[jarvis-voice-session] unexpected token shape", Object.keys(payload));
      return json({ error: "Ogiltigt svar från Voice Agent." }, 502);
    }

    return json({
      client_secret: clientSecret,
      expires_in: 300,
      model: Deno.env.get("XAI_VOICE_MODEL")?.trim() || "grok-voice-latest",
      voice: Deno.env.get("XAI_TTS_VOICE")?.trim() || "ara",
      instructions: voiceAgentInstructions({
        orgName: (org as { name?: string } | null)?.name ?? null,
        pageLabel: pageLabel || null,
      }),
      tools: voiceAgentTools(),
      keyterms: [
        "Liljeblads",
        "Jarvis",
        "Nolhaga",
        "Hjulet",
        "Axcell",
        "arbetsorder",
        "asfaltering",
      ],
    });
  } catch (e) {
    console.error("[jarvis-voice-session]", e);
    return json({ error: "Kunde inte starta röstläge." }, 500);
  }
});
