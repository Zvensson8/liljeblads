/**
 * Jarvis daily briefing → email to org owners/admins (their own profile email only).
 *
 * Auth: x-cron-secret or founder/admin JWT
 * Schedule: 0 6 * * 1-5  (weekdays 06:00 UTC) via schedule-agent-crons.mjs
 *
 * Without RESEND_API_KEY: dry-run payload only.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  assertCronOrAdminAuthorized,
  cronCorsHeaders,
} from "../_shared/cronAuth.ts";
import { getResendClient, resendFrom } from "../_shared/resendClient.ts";
import {
  buildDailyBriefing,
  formatBriefingPlain,
} from "../_shared/jarvisBriefing.ts";

const corsHeaders = cronCorsHeaders;

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
      const { data: orgs, error } = await supabase.from("organizations").select("id");
      if (error) throw error;
      orgIds = (orgs ?? []).map((o) => o.id as string);
    }

    const resend = getResendClient();
    const forceDry = body.dry_run === true || !resend;
    const appUrl = Deno.env.get("PUBLIC_APP_URL") || "https://liljeblads.vercel.app";
    const results: Array<Record<string, unknown>> = [];

    for (const orgId of orgIds) {
      const row: Record<string, unknown> = {
        orgId,
        emailed: false,
        recipients: [] as string[],
      };
      try {
        // Fas 3: respect org setting daily_briefing_enabled (default true if missing)
        const { data: settings } = await supabase
          .from("organization_jarvis_settings")
          .select("daily_briefing_enabled, daily_briefing_roles")
          .eq("organization_id", orgId)
          .maybeSingle();
        if (settings && settings.daily_briefing_enabled === false) {
          row.skipped = true;
          row.reason = "briefing_disabled";
          results.push(row);
          continue;
        }
        const roleFilter =
          (settings?.daily_briefing_roles as string[] | null) ||
          ["owner", "admin"];

        const stats = await buildDailyBriefing(supabase, orgId);
        row.orgName = stats.orgName;
        row.stats = {
          openWorkOrders: stats.openWorkOrders,
          overdueWorkOrders: stats.overdueWorkOrders,
          openProjects: stats.openProjects,
          pendingTodos: stats.pendingTodos,
          pendingAiActions: stats.pendingAiActions,
          highRiskComponents: stats.highRiskComponents,
        };

        // Skip quiet orgs (nothing to report)
        const signal =
          stats.openWorkOrders +
          stats.overdueWorkOrders +
          stats.pendingTodos +
          stats.pendingAiActions +
          stats.highRiskComponents;
        if (signal === 0) {
          row.skipped = true;
          row.reason = "no_activity";
          results.push(row);
          continue;
        }

        const plain =
          formatBriefingPlain(stats) +
          `\n\nÖppna: ${appUrl}/jarvis`;

        const { data: members } = await supabase
          .from("organization_members")
          .select("user_id, role")
          .eq("organization_id", orgId)
          .in("role", roleFilter.length ? roleFilter : ["owner", "admin"]);
        const userIds = (members ?? []).map((m) => m.user_id as string);
        let emails: string[] = [];
        if (userIds.length) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("email")
            .in("id", userIds);
          emails = [
            ...new Set(
              (profiles ?? [])
                .map((p) => (p.email as string | null) || "")
                .filter((e) => e.includes("@")),
            ),
          ];
        }
        row.recipients = emails.map((e) =>
          e.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
        );

        if (!forceDry && resend && emails.length) {
          // One email per recipient (no BCC of others — least privilege)
          for (const email of emails) {
            await resend.emails.send({
              from: resendFrom(),
              to: [email],
              subject: `[Jarvis] Daglig briefing – ${stats.orgName}`,
              text: plain,
            });
          }
          row.emailed = true;

          // Audit first recipient aggregate (service job)
          await supabase.from("jarvis_action_log").insert({
            organization_id: orgId,
            user_id: userIds[0],
            tool_name: "jarvis_daily_briefing_cron",
            args_summary: { recipient_count: emails.length },
            result_summary: row.stats,
            success: true,
            entity_type: "email",
          });
        }
      } catch (e) {
        row.error = e instanceof Error ? e.message : String(e);
      }
      results.push(row);
    }

    return new Response(
      JSON.stringify({ ok: true, dryRun: forceDry, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
