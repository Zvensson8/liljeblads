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

    if (todos && todos.length > 0) {
      for (const todo of todos as Todo[]) {
        console.log(`Sending reminder for todo: ${todo.title}`);
        
        const propertyInfo = todo.properties 
          ? `<p><strong>Fastighet:</strong> ${todo.properties.name}<br>${todo.properties.address}</p>`
          : '';
        
        const dueDateInfo = todo.due_date 
          ? `<p><strong>Förfallodatum:</strong> ${new Date(todo.due_date).toLocaleDateString('sv-SE')}</p>`
          : '';
        
        const notesInfo = todo.notes 
          ? `<p><strong>Anteckningar:</strong><br>${todo.notes}</p>`
          : '';
        
        const priorityLabels: Record<string, string> = {
          low: 'Låg',
          medium: 'Medel',
          high: 'Hög',
          critical: 'Kritisk'
        };

        try {
          const { error: emailError } = await resend.emails.send({
            from: "Påminnelse <onboarding@resend.dev>",
            to: [todo.reminder_email],
            subject: `Påminnelse: ${todo.title}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Påminnelse om uppgift</h2>
                <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="margin-top: 0;">${todo.title}</h3>
                  <p><strong>Prioritet:</strong> ${priorityLabels[todo.priority] || todo.priority}</p>
                  ${todo.category ? `<p><strong>Kategori:</strong> ${todo.category}</p>` : ''}
                  ${dueDateInfo}
                  ${propertyInfo}
                  ${notesInfo}
                </div>
                <p style="color: #666; font-size: 14px;">Detta är en automatisk påminnelse från ditt fastighetssystem.</p>
              </div>
            `,
          });

          if (emailError) {
            console.error(`Failed to send email for todo ${todo.id}:`, emailError);
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
        } catch (emailError) {
          console.error(`Error sending email for todo ${todo.id}:`, emailError);
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
    console.error("Error in send-todo-reminders function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
};

serve(handler);
