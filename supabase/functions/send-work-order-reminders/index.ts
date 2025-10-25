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
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f3f4f6; }
    .container { max-width: 700px; margin: 0 auto; background: white; }
    .header { text-align: center; padding: 40px 20px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; }
    .header h1 { margin: 0 0 10px 0; font-size: 28px; }
    .content { padding: 40px 30px; }
    .alert-box { background: #fef3c7; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
    .info-box { background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .stat { text-align: center; background: #fef3c7; padding: 20px; border-radius: 8px; margin: 15px 0; }
    .stat-value { font-size: 36px; font-weight: bold; color: #d97706; margin-bottom: 5px; }
    .stat-label { font-size: 14px; color: #92400e; }
    .template-box { background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb; }
    .footer { text-align: center; padding: 30px; background: #f9fafb; color: #6b7280; font-size: 14px; }
    h2 { color: #111827; margin-top: 0; }
    h3 { color: #2563eb; margin-top: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⏰ Påminnelse: Arbetsorder</h1>
      <p>Uppföljning behövs</p>
    </div>
    
    <div class="content">
      <div class="alert-box">
        <h2 style="color: #92400e;">Dags för uppföljning!</h2>
        <p style="margin: 0; color: #78350f;">Det har nu gått <strong>${daysSinceCreated} dagar</strong> sedan arbetet med <strong>${order.action}</strong> påbörjades på <strong>${order.properties.name}</strong>.</p>
      </div>

      <div class="stat">
        <div class="stat-value">${daysSinceCreated}</div>
        <div class="stat-label">Dagar sedan beställning</div>
      </div>

      <div class="info-box">
        <h2>📋 Arbetsorderinformation</h2>
        <p><strong>Åtgärd:</strong> ${order.action}</p>
        <p><strong>Fastighet:</strong> ${order.properties.name}</p>
        <p style="margin-bottom: 0;"><strong>Status:</strong> Beställd</p>
      </div>

      <div class="template-box">
        <h3>📧 Föreslagen uppföljningsmall</h3>
        <div style="background: white; padding: 15px; border-radius: 4px; margin-top: 15px;">
          <p style="margin: 0 0 10px 0;">Hej,</p>
          <p style="margin: 0 0 10px 0;">Hoppas allt är bra!</p>
          <p style="margin: 0 0 10px 0;">Vill bara följa upp status avseende arbetet med <strong>${order.action}</strong> på <strong>${order.properties.name}</strong>.</p>
          <p style="margin: 0;">Ha en bra dag!</p>
        </div>
      </div>

      <p style="background: #ecfdf5; padding: 15px; border-radius: 4px; color: #047857; border-left: 4px solid #10b981;">
        <strong>💡 Tips:</strong> När arbetet är slutfört, kom ihåg att ändra status till "Avslutat" i systemet.
      </p>
    </div>
    
    <div class="footer">
      <p>Detta är en automatisk påminnelse från ditt fastighetssystem</p>
      <p style="font-size: 12px; color: #9ca3af;">För att sluta få påminnelser: ändra status på arbetsordern eller stäng av påminnelser</p>
    </div>
  </div>
</body>
</html>
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
