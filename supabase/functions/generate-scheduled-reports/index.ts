import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    let successCount = 0;
    let errorCount = 0;

    // Process each report
    for (const report of dueReports || []) {
      try {
        console.log(`Processing report: ${report.name} (${report.id})`);

        // TODO: Implement actual report generation logic here
        // For now, just log and update next_run
        
        // Calculate next run time based on schedule
        const nextRun = calculateNextRun(report.schedule);

        // Update report status
        await supabaseClient
          .from('scheduled_reports')
          .update({
            last_run: now.toISOString(),
            next_run: nextRun.toISOString(),
          })
          .eq('id', report.id);

        console.log(`✓ Report ${report.name} processed. Next run: ${nextRun}`);
        successCount++;
      } catch (error) {
        console.error(`✗ Error processing report ${report.name}:`, error);
        errorCount++;
      }
    }

    console.log(`Completed: ${successCount} succeeded, ${errorCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: dueReports?.length || 0,
        succeeded: successCount,
        failed: errorCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
