import { Resend } from "https://esm.sh/resend@4.0.0";

/**
 * Lazy Resend client. Returns null when RESEND_API_KEY is missing
 * so cron/mail functions can fail soft instead of crashing at import time.
 */
export function getResendClient(): Resend | null {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key || key.trim().length < 8) {
    console.warn("RESEND_API_KEY is not configured");
    return null;
  }
  return new Resend(key);
}

export function resendMissingResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: "RESEND_API_KEY is not configured",
      hint: "Set with: npx supabase secrets set RESEND_API_KEY=re_xxx",
    }),
    {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

/** Default From address — override with RESEND_FROM_EMAIL secret */
export function resendFrom(): string {
  return Deno.env.get("RESEND_FROM_EMAIL") ?? "Liljeblads <onboarding@resend.dev>";
}
