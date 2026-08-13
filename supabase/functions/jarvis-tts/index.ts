import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAX_CHARS = 2000;
const ALLOWED_VOICES = new Set([
  "ara",
  "eve",
  "rex",
  "sal",
  "leo",
  "carina",
  "luna",
  "orion",
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function defaultVoice(): string {
  const v = (Deno.env.get("XAI_TTS_VOICE") || "ara").trim().toLowerCase();
  return ALLOWED_VOICES.has(v) ? v : "ara";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const key = (Deno.env.get("XAI_API_KEY") || "").trim();
    if (!key) {
      return json({ error: "XAI_API_KEY saknas — Grok-röst är inte konfigurerad." }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Authorization header required" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userError || !userData?.user?.id) {
      return json({ error: "Session expired. Please log in again." }, 401);
    }

    const limited = await checkRateLimit(userData.user.id, {
      endpoint: "jarvis-tts",
      maxRequests: 40,
      windowSeconds: 60,
    });
    const blocked = rateLimitResponse(limited, corsHeaders);
    if (blocked) return blocked;

    const body = await req.json().catch(() => ({}));
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return json({ error: "text krävs" }, 400);
    if (text.length > MAX_CHARS) {
      return json({ error: `text får vara högst ${MAX_CHARS} tecken` }, 400);
    }

    const requested = typeof body?.voice === "string"
      ? body.voice.trim().toLowerCase()
      : "";
    const voice_id = ALLOWED_VOICES.has(requested) ? requested : defaultVoice();

    const xai = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        voice_id,
        language: "auto",
        text_normalization: true,
        speed: 1.02,
        output_format: {
          codec: "mp3",
          sample_rate: 24000,
          bit_rate: 128000,
        },
      }),
    });

    if (!xai.ok) {
      const errText = await xai.text();
      console.error(`[jarvis-tts] xAI ${xai.status}: ${errText.slice(0, 400)}`);
      return json(
        { error: "Kunde inte skapa röst just nu." },
        xai.status === 429 ? 429 : 502,
      );
    }

    const audio = await xai.arrayBuffer();
    return new Response(audio, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[jarvis-tts]", e);
    return json({ error: "TTS-fel" }, 500);
  }
});
