/**
 * CORS helpers for edge functions.
 * Set ALLOWED_ORIGINS as comma-separated list, e.g.
 *   https://app.example.com,http://localhost:8080
 * Default: reflect request origin if present, else * for local flexibility.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const origin = req.headers.get("Origin") ?? "";
  let allowOrigin = "*";

  if (allowed.length > 0) {
    if (origin && allowed.includes(origin)) {
      allowOrigin = origin;
    } else if (!origin) {
      // non-browser callers (cron, curl)
      allowOrigin = allowed[0];
    } else {
      // disallowed origin — still answer preflight but do not echo untrusted origin
      allowOrigin = allowed[0];
    }
  } else if (origin) {
    allowOrigin = origin;
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Vary": "Origin",
  };
}

export function handleCorsOptions(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  return null;
}
