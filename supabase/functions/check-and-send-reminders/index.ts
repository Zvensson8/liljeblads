import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UserPreferences {
  user_id: string;
  organization_id: string;
  monthly_project_summary: boolean;
  monthly_workorder_summary: boolean;
  maintenance_reminders: boolean;
  maintenance_history_annual: boolean;
  preferred_day: string;
  notification_email: string | null;
  project_summary_previewed: boolean;
  workorder_summary_previewed: boolean;
  maintenance_reminders_previewed: boolean;
  maintenance_history_previewed: boolean;
  project_summary_frequency: string;
  project_summary_time: string;
  workorder_summary_frequency: string;
  workorder_summary_time: string;
  maintenance_reminders_frequency: string;
  maintenance_reminders_time: string;
  maintenance_history_frequency: string;
  maintenance_history_time: string;
  profiles: {
    email: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting check-and-send-reminders...");

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const dayOfMonth = now.getDate();
    const month = now.getMonth(); // 0-11

    // Fetch all active preferences
    const { data: preferences, error } = await supabase
      .from('user_notification_preferences')
      .select(`
        user_id,
        organization_id,
        monthly_project_summary,
        monthly_workorder_summary,
        maintenance_reminders,
        maintenance_history_annual,
        preferred_day,
        notification_email,
        project_summary_previewed,
        workorder_summary_previewed,
        maintenance_reminders_previewed,
        maintenance_history_previewed,
        project_summary_frequency,
        project_summary_time,
        workorder_summary_frequency,
        workorder_summary_time,
        maintenance_reminders_frequency,
        maintenance_reminders_time,
        maintenance_history_frequency,
        maintenance_history_time,
        profiles!inner(email)
      `);

    if (error) {
      console.error("Error fetching preferences:", error);
      throw error;
    }

    const typedPrefs = preferences as unknown as UserPreferences[];
    console.log(`Found ${typedPrefs.length} users with notification preferences`);

    let totalSent = 0;
    const results: any[] = [];

    for (const pref of typedPrefs) {
      const userEmail = pref.notification_email || pref.profiles.email;

      // Helper function to check if it's time to send based on frequency
      const shouldSendBasedOnFrequency = (frequency: string, scheduledTime: string): boolean => {
        // Check if time matches (within 5 minute window)
        const [schedHour, schedMin] = scheduledTime.split(':').map(Number);
        const scheduleMinutes = schedHour * 60 + schedMin;
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const timeDiff = Math.abs(currentMinutes - scheduleMinutes);
        
        if (timeDiff > 5) return false; // Not within time window

        switch (frequency) {
          case 'daily':
            return true;
          case 'weekly':
            return dayOfWeek === 1; // Monday
          case 'monthly':
            return dayOfMonth <= 7 && pref.preferred_day === getDayName(dayOfWeek); // First week, preferred day
          case 'yearly':
            return month === 0 && dayOfMonth === 1; // January 1st
          default:
            return false;
        }
      };

      // Check maintenance reminders
      if (
        pref.maintenance_reminders &&
        pref.maintenance_reminders_previewed &&
        shouldSendBasedOnFrequency(pref.maintenance_reminders_frequency, pref.maintenance_reminders_time)
      ) {
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/send-maintenance-reminders`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({
              userId: pref.user_id,
              userEmail,
              organizationId: pref.organization_id
            })
          });
          
          if (response.ok) {
            totalSent++;
            results.push({ user: userEmail, report: 'maintenance_reminders', status: 'sent' });
            console.log(`Sent maintenance reminders to ${userEmail}`);
          }
        } catch (error) {
          console.error(`Failed to send maintenance reminders to ${userEmail}:`, error);
          results.push({ user: userEmail, report: 'maintenance_reminders', status: 'failed' });
        }
      }

      // Check project summary
      if (
        pref.monthly_project_summary &&
        pref.project_summary_previewed &&
        shouldSendBasedOnFrequency(pref.project_summary_frequency, pref.project_summary_time)
      ) {
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/send-monthly-project-summary`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({
              userId: pref.user_id,
              userEmail,
              organizationId: pref.organization_id
            })
          });
          
          if (response.ok) {
            totalSent++;
            results.push({ user: userEmail, report: 'project_summary', status: 'sent' });
            console.log(`Sent project summary to ${userEmail}`);
          }
        } catch (error) {
          console.error(`Failed to send project summary to ${userEmail}:`, error);
          results.push({ user: userEmail, report: 'project_summary', status: 'failed' });
        }
      }

      // Check work order summary
      if (
        pref.monthly_workorder_summary &&
        pref.workorder_summary_previewed &&
        shouldSendBasedOnFrequency(pref.workorder_summary_frequency, pref.workorder_summary_time)
      ) {
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/send-monthly-workorder-summary`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({
              userId: pref.user_id,
              userEmail,
              organizationId: pref.organization_id
            })
          });
          
          if (response.ok) {
            totalSent++;
            results.push({ user: userEmail, report: 'workorder_summary', status: 'sent' });
            console.log(`Sent work order summary to ${userEmail}`);
          }
        } catch (error) {
          console.error(`Failed to send work order summary to ${userEmail}:`, error);
          results.push({ user: userEmail, report: 'workorder_summary', status: 'failed' });
        }
      }

      // Check annual maintenance history
      if (
        pref.maintenance_history_annual &&
        pref.maintenance_history_previewed &&
        shouldSendBasedOnFrequency(pref.maintenance_history_frequency, pref.maintenance_history_time)
      ) {
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/send-maintenance-history-annual`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify({
              userId: pref.user_id,
              userEmail,
              organizationId: pref.organization_id
            })
          });
          
          if (response.ok) {
            totalSent++;
            results.push({ user: userEmail, report: 'maintenance_history', status: 'sent' });
            console.log(`Sent maintenance history to ${userEmail}`);
          }
        } catch (error) {
          console.error(`Failed to send maintenance history to ${userEmail}:`, error);
          results.push({ user: userEmail, report: 'maintenance_history', status: 'failed' });
        }
      }
    }

    console.log(`Check complete. Sent ${totalSent} reports.`);

    return new Response(
      JSON.stringify({
        success: true,
        totalSent,
        date: now.toISOString(),
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in check-and-send-reminders:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

function getDayName(dayOfWeek: number): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[dayOfWeek];
}
