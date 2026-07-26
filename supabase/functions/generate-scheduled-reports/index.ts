import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertCronAuthorized, cronCorsHeaders } from "../_shared/cronAuth.ts";

const corsHeaders = cronCorsHeaders;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const unauthorized = assertCronAuthorized(req);
  if (unauthorized) return unauthorized;

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting scheduled reports generation...');

    // Get all active scheduled reports that are due to run
    const now = new Date();
    const { data: dueReports, error: fetchError } = await supabaseClient
      .from('scheduled_reports')
      .select('*')
      .eq('is_active', true)
      .lte('next_run', now.toISOString());

    if (fetchError) {
      console.error('Error fetching due reports:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${dueReports?.length || 0} reports due to run`);

    // Report generation (PDF/XLSX + email) is not implemented yet.
    // Do NOT advance next_run — that would silently skip real deliveries.
    return new Response(
      JSON.stringify({
        success: false,
        implemented: false,
        message:
          'Scheduled report generation is not implemented yet. Reports were not marked as run.',
        due: dueReports?.length || 0,
        reports: (dueReports || []).map((r: { id: string; name: string }) => ({
          id: r.id,
          name: r.name,
        })),
      }),
      {
        status: 501,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in generate-scheduled-reports:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

function calculateNextRun(cronSchedule: string): Date {
  const now = new Date();
  
  // Simple cron parsing for common patterns
  if (cronSchedule === '0 8 * * *') {
    // Daily at 8am
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(8, 0, 0, 0);
    return next;
  } else if (cronSchedule === '0 8 * * 1') {
    // Weekly on Monday at 8am
    const next = new Date(now);
    next.setDate(next.getDate() + (8 - next.getDay()) % 7);
    next.setHours(8, 0, 0, 0);
    return next;
  } else if (cronSchedule === '0 8 1 * *') {
    // Monthly on 1st at 8am
    const next = new Date(now);
    next.setMonth(next.getMonth() + 1);
    next.setDate(1);
    next.setHours(8, 0, 0, 0);
    return next;
  }
  
  // Default: 24 hours from now
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}
