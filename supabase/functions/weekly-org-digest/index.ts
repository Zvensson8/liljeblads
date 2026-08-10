/**
 * Monday org digest graph (safe autonomy):
 *   per org → gather WO/todos/risk pending → optional LLM summary → Resend to owners/admins
 *
 * Auth: x-cron-secret or founder JWT
 * Schedule: 0 7 * * 1  (Monday 07:00 UTC)
 *
 * Without RESEND_API_KEY: returns dry-run payload (no email).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  assertCronOrAdminAuthorized,
  cronCorsHeaders,
} from "../_shared/cronAuth.ts";
import { getResendClient, resendFrom } from "../_shared/resendClient.ts";
import { chatCompletion, isLlmConfigured } from "../_shared/llmClient.ts";

const corsHeaders = cronCorsHeaders;

type OrgDigest = {
  orgId: string;
  orgName: string;
  openWorkOrders: number;
  overdueWorkOrders: number;
  pendingTodos: number;
  pendingAiActions: number;
  recipients: string[];
  emailed: boolean;
  error?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const unauthorized = await assertCronOrAdminAuthorized(req);
  if (unauthorized) return unauthorized;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let body: { organization_id?: string; dry_run?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    let orgIds: string[] = [];
    if (body.organization_id) {
      orgIds = [body.organization_id];
    } else {
      const { data: orgs, error } = await supabase.from("organizations").select("id, name");
      if (error) throw error;
      orgIds = (orgs ?? []).map((o) => o.id as string);
    }

    const { data: orgRows } = await supabase
      .from("organizations")
      .select("id, name")
      .in("id", orgIds.length ? orgIds : ["00000000-0000-0000-0000-000000000000"]);
    const nameById = new Map((orgRows ?? []).map((o) => [o.id as string, o.name as string]));

    const resend = getResendClient();
    const forceDry = body.dry_run === true || !resend;
    const digests: OrgDigest[] = [];
    const today = new Date().toISOString().slice(0, 10);

    for (const orgId of orgIds) {
      const digest: OrgDigest = {
        orgId,
        orgName: nameById.get(orgId) || orgId,
        openWorkOrders: 0,
        overdueWorkOrders: 0,
        pendingTodos: 0,
        pendingAiActions: 0,
        recipients: [],
        emailed: false,
      };

      try {
        const { data: props } = await supabase
          .from("properties")
          .select("id")
          .eq("organization_id", orgId);
        const propIds = (props ?? []).map((p) => p.id as string);

        if (propIds.length) {
          const { data: wos } = await supabase
            .from("work_orders")
            .select("id, due_date, status")
            .in("property_id", propIds)
            .in("status", ["not_started", "awaiting_quote", "ordered"]);
          digest.openWorkOrders = wos?.length ?? 0;
          digest.overdueWorkOrders = (wos ?? []).filter(
            (w) => w.due_date && String(w.due_date) < today,
          ).length;

          const { count: todoCount } = await supabase
            .from("property_todos")
            .select("id", { count: "exact", head: true })
            .in("property_id", propIds)
            .eq("status", "pending");
          digest.pendingTodos = todoCount ?? 0;
        }

        const { count: aiCount } = await supabase
          .from("ai_suggested_actions")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId)
          .eq("status", "pending");
        digest.pendingAiActions = aiCount ?? 0;

        // Recipients: org owners/admins with email on profile
        const { data: members } = await supabase
          .from("organization_members")
          .select("user_id, role")
          .eq("organization_id", orgId)
          .in("role", ["owner", "admin"]);
        const userIds = (members ?? []).map((m) => m.user_id as string);
        if (userIds.length) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("email")
            .in("id", userIds);
          digest.recipients = [
            ...new Set(
              (profiles ?? [])
                .map((p) => (p.email as string | null) || "")
                .filter((e) => e.includes("@")),
            ),
          ];
        }

        const plain = [
          `Veckosammanfattning – ${digest.orgName}`,
          ``,
          `Öppna arbetsordrar: ${digest.openWorkOrders}`,
          `Förfallna arbetsordrar: ${digest.overdueWorkOrders}`,
          `Öppna todos: ${digest.pendingTodos}`,
          `Väntande AI-förslag: ${digest.pendingAiActions}`,
          ``,
          `Logga in: ${Deno.env.get("PUBLIC_APP_URL") || "https://liljeblads.vercel.app"}`,
        ].join("\n");

        let htmlBody = `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${plain}</pre>`;

        if (isLlmConfigured() && (digest.openWorkOrders + digest.pendingAiActions + digest.pendingTodos) > 0) {
          try {
            const llm = await chatCompletion({
              messages: [
                {
                  role: "system",
                  content: [
                    "Du är driftchef-assistent för svensk fastighetsförvaltning.",
                    "Skriv en veckosammanfattning på svenska i tre korta sektioner:",
                    "1) Läget i en mening",
                    "2) Prioriteringar (max 3 punkter, baserat ENDAST på siffrorna)",
                    "3) Rekommenderad nästa åtgärd (en mening)",
                    "Använd ALDRIG siffror som inte finns i indata. Max 100 ord totalt. Ingen hälsningsfras.",
                  ].join(" "),
                },
                {
                  role: "user",
                  content: plain,
                },
              ],
              maxTokens: 350,
              temperature: 0.2,
            });
            const text = (llm as { content?: string }).content?.trim();
            if (text) {
              htmlBody = `<div style="font-family:system-ui,sans-serif;line-height:1.5;max-width:560px">
                <h2 style="margin:0 0 12px">Drift – ${digest.orgName}</h2>
                <div style="background:#f8fafc;border-radius:8px;padding:14px;margin-bottom:16px">${
                  text.replace(/\n/g, "<br/>")
                }</div>
                <h3 style="margin:0 0 8px;font-size:14px;color:#64748b">Nyckeltal</h3>
                <pre style="background:#f1f5f9;padding:12px;border-radius:8px;white-space:pre-wrap;font-size:13px">${plain}</pre>
              </div>`;
            }
          } catch (e) {
            console.warn("LLM digest failed", e);
          }
        }

        if (!forceDry && resend && digest.recipients.length) {
          await resend.emails.send({
            from: resendFrom(),
            to: digest.recipients,
            subject: `Liljeblads veckosammanfattning – ${digest.orgName}`,
            html: htmlBody,
          });
          digest.emailed = true;
        }
      } catch (e) {
        digest.error = e instanceof Error ? e.message : String(e);
      }

      digests.push(digest);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        dryRun: forceDry,
        digests,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
