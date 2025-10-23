import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string);

interface WorkOrder {
  id: string;
  action: string;
  status: string;
  reminder_enabled: boolean;
  reminder_frequency: string;
  reminder_recipient_email: string;
  last_reminder_sent: string | null;
  created_at: string;
  properties: {
    name: string;
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting work order reminder check...");

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch work orders that need reminders
    const { data: workOrders, error: fetchError } = await supabase
      .from('work_orders')
      .select(`
        id,
        action,
        status,
        reminder_enabled,
        reminder_frequency,
        reminder_recipient_email,
        last_reminder_sent,
        created_at,
        properties(name)
      `)
      .eq('reminder_enabled', true)
      .eq('status', 'ordered');

    if (fetchError) {
      console.error("Error fetching work orders:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${workOrders?.length || 0} work orders with reminders enabled`);

    let remindersSent = 0;
    const now = new Date();

    for (const order of (workOrders as unknown as WorkOrder[]) || []) {
      // Check if reminder should be sent based on frequency
      const shouldSendReminder = checkIfReminderDue(
        order.last_reminder_sent,
        order.reminder_frequency,
        now
      );

      if (shouldSendReminder && order.reminder_recipient_email) {
        console.log(`Sending reminder for work order ${order.id}`);
        
        // Calculate days since order was placed
        const createdDate = new Date(order.created_at);
        const daysSinceCreated = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24));

        const emailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Påminnelse: Uppföljning av arbetsorder</h2>
            
            <p>Hej,</p>
            <p>Hoppas allt är bra!</p>
            
            <p>Det har nu gått <strong>${daysSinceCreated} dagar</strong> sedan arbetet med <strong>${order.action}</strong> påbörjades.</p>
            
            <p>Dags för uppföljning av arbetet.</p>
            
            <p>Är det slutfört, vänligen ändra status till avslutat.</p>
            
            <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-left: 4px solid #2563eb;">
              <h3 style="margin-top: 0; color: #2563eb;">Mall för uppföljning:</h3>
              <p style="margin: 0;">Hej,</p>
              <p>Hoppas allt är bra!</p>
              <p>Vill bara följa upp status avseende arbetet med <strong>${order.action}</strong> på <strong>${order.properties.name}</strong>.</p>
              <p style="margin-bottom: 0;">Ha en bra dag!</p>
            </div>
            
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              För att sluta få dessa påminnelser, ändra status på arbetsordern eller stäng av påminnelser i arbetsordern.
            </p>
          </div>
        `;

        try {
          await resend.emails.send({
            from: 'Arbetsorderpåminnelser <onboarding@resend.dev>',
            to: [order.reminder_recipient_email],
            subject: `Påminnelse: Uppföljning av ${order.action}`,
            html: emailHtml,
          });

          // Update last_reminder_sent timestamp
          await supabase
            .from('work_orders')
            .update({ last_reminder_sent: now.toISOString() })
            .eq('id', order.id);

          remindersSent++;
          console.log(`Reminder sent successfully for work order ${order.id}`);
        } catch (emailError) {
          console.error(`Failed to send reminder for work order ${order.id}:`, emailError);
        }
      }
    }

    console.log(`Reminder check complete. Sent ${remindersSent} reminders.`);

    return new Response(
      JSON.stringify({
        success: true,
        remindersSent,
        message: `Sent ${remindersSent} reminders`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in send-work-order-reminders function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

function checkIfReminderDue(
  lastSent: string | null,
  frequency: string,
  now: Date
): boolean {
  if (!lastSent) {
    // Never sent, send immediately
    return true;
  }

  const lastSentDate = new Date(lastSent);
  const daysSinceLastSent = Math.floor((now.getTime() - lastSentDate.getTime()) / (1000 * 60 * 60 * 24));

  switch (frequency) {
    case 'weekly':
      return daysSinceLastSent >= 7;
    case 'biweekly':
      return daysSinceLastSent >= 14;
    case 'triweekly':
      return daysSinceLastSent >= 21;
    case 'monthly':
      return daysSinceLastSent >= 30;
    default:
      return false;
  }
}
