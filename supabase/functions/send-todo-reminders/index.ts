import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Todo {
  id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  priority: string;
  category: string | null;
  reminder_email: string;
  reminder_date: string;
  properties: {
    name: string;
    address: string;
  } | null;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log("Fetching todos with reminders...");
    
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    const { data: todos, error: fetchError } = await supabase
      .from("property_todos")
      .select(`
        id,
        title,
        notes,
        due_date,
        priority,
        category,
        reminder_email,
        reminder_date,
        properties (
          name,
          address
        )
      `)
      .not("reminder_email", "is", null)
      .not("reminder_date", "is", null)
      .eq("completed", false)
      .lte("reminder_date", today);

    if (fetchError) {
      console.error("Error fetching todos:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${todos?.length || 0} todos with reminders due`);

    let sentCount = 0;

    const escapeHtml = (text: string): string => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    if (todos && todos.length > 0) {
      for (const todo of todos as Todo[]) {
        const maskedEmail = todo.reminder_email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
        console.log(`Sending reminder for todo: ${todo.title} to ${maskedEmail}`);
        
        const propertyInfo = todo.properties 
          ? `<p><strong>Fastighet:</strong> ${escapeHtml(todo.properties.name)}<br>${escapeHtml(todo.properties.address)}</p>`
          : '';
        
        const dueDateInfo = todo.due_date 
          ? `<p><strong>Förfallodatum:</strong> ${new Date(todo.due_date).toLocaleDateString('sv-SE')}</p>`
          : '';
        
        const notesInfo = todo.notes 
          ? `<p><strong>Anteckningar:</strong><br>${escapeHtml(todo.notes)}</p>`
          : '';
        
        const priorityLabels: Record<string, string> = {
          low: 'Låg',
          medium: 'Medel',
          high: 'Hög',
          critical: 'Kritisk'
        };

        try {
          const priorityColors: Record<string, { bg: string, text: string }> = {
            low: { bg: '#dcfce7', text: '#166534' },
            medium: { bg: '#fef3c7', text: '#92400e' },
            high: { bg: '#fee2e2', text: '#991b1b' },
            critical: { bg: '#fecaca', text: '#7f1d1d' }
          };
          const priorityColor = priorityColors[todo.priority] || priorityColors.medium;

          const { error: emailError } = await resend.emails.send({
            from: "Påminnelse <onboarding@resend.dev>",
            to: [todo.reminder_email],
            subject: `Påminnelse: ${escapeHtml(todo.title)}`,
            html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f3f4f6; }
    .container { max-width: 700px; margin: 0 auto; background: white; }
    .header { text-align: center; padding: 40px 20px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; }
    .header h1 { margin: 0 0 10px 0; font-size: 28px; }
    .content { padding: 40px 30px; }
    .todo-box { background: #f9fafb; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #8b5cf6; }
    .priority-badge { display: inline-block; padding: 6px 16px; border-radius: 12px; font-size: 13px; font-weight: 600; background: ${priorityColor.bg}; color: ${priorityColor.text}; }
    .info-row { margin: 12px 0; padding: 12px; background: white; border-radius: 4px; }
    .footer { text-align: center; padding: 30px; background: #f9fafb; color: #6b7280; font-size: 14px; }
    h2 { color: #111827; margin-top: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📌 Påminnelse: Uppgift</h1>
      <p>Du har en uppgift som kräver uppmärksamhet</p>
    </div>
    
    <div class="content">
      <div class="todo-box">
        <h2>${escapeHtml(todo.title)}</h2>
        
        <div class="info-row">
          <strong>🎯 Prioritet:</strong> <span class="priority-badge">${escapeHtml(priorityLabels[todo.priority] || todo.priority)}</span>
        </div>

        ${todo.category ? `
        <div class="info-row">
          <strong>📂 Kategori:</strong> ${escapeHtml(todo.category)}
        </div>
        ` : ''}

        ${todo.due_date ? `
        <div class="info-row">
          <strong>📅 Förfallodatum:</strong> ${new Date(todo.due_date).toLocaleDateString('sv-SE')}
        </div>
        ` : ''}

        ${todo.properties ? `
        <div class="info-row">
          <strong>🏢 Fastighet:</strong> ${escapeHtml(todo.properties.name)}<br>
          <span style="color: #6b7280; font-size: 14px;">${escapeHtml(todo.properties.address)}</span>
        </div>
        ` : ''}

        ${todo.notes ? `
        <div class="info-row">
          <strong>📝 Anteckningar:</strong><br>
          <span style="color: #374151;">${escapeHtml(todo.notes)}</span>
        </div>
        ` : ''}
      </div>

      <p style="background: #fef3c7; padding: 15px; border-radius: 4px; color: #92400e; border-left: 4px solid #f59e0b; margin: 20px 0;">
        <strong>⚠️ Påminnelse:</strong> Denna uppgift har nått sitt påminnelsedatum. Vänligen vidta nödvändiga åtgärder.
      </p>
    </div>
    
    <div class="footer">
      <p>Detta är en automatisk påminnelse från ditt fastighetssystem</p>
      <p style="font-size: 12px; color: #9ca3af;">Genererad ${new Date().toLocaleDateString('sv-SE')} ${new Date().toLocaleTimeString('sv-SE')}</p>
    </div>
  </div>
</body>
</html>
            `,
          });

          if (emailError) {
            console.error(`Failed to send email for todo ${todo.id}:`, emailError.message || "Unknown error");
          } else {
            console.log(`Email sent successfully for todo ${todo.id}`);
            
            // Clear reminder after sending
            await supabase
              .from("property_todos")
              .update({ 
                reminder_email: null, 
                reminder_date: null 
              })
              .eq("id", todo.id);
            
            sentCount++;
          }
        } catch (emailError: any) {
          console.error(`Error sending email for todo ${todo.id}:`, emailError.message || "Unknown error");
        }
      }
    }

    console.log(`Sent ${sentCount} reminders`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Sent ${sentCount} reminders`,
        processed: todos?.length || 0
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in send-todo-reminders function:", error.message || "Unknown error");
    return new Response(
      JSON.stringify({ error: "Failed to send todo reminders" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
