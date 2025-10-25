import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProjectOrderRequest {
  projectId: string;
  userEmail: string;
}

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, userEmail }: ProjectOrderRequest = await req.json();

    if (!projectId || !userEmail) {
      throw new Error("Project ID och användarens e-post är obligatoriska");
    }

    // Använd service role key för att hämta data
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Hämta projekt med fastighet och organisation
    const { data: project, error: projectError } = await supabaseClient
      .from("projects")
      .select(`
        *,
        property:properties (
          id,
          name,
          property_number,
          address,
          invoice_address,
          organization:organizations (
            name,
            logo_url
          )
        )
      `)
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      throw new Error("Projekt hittades inte");
    }

    if (!project.property) {
      throw new Error("Fastighet hittades inte för projektet");
    }

    // Hämta huvudkontakt
    const { data: contacts } = await supabaseClient
      .from("property_contacts")
      .select("*")
      .eq("property_id", project.property.id)
      .limit(1);

    const contact = contacts && contacts.length > 0 ? contacts[0] : null;

    console.log("Skickar beställningsutkast till:", userEmail);

    // Översätt projekttyp
    const typeLabels: Record<string, string> = {
      "investment": "Investering",
      "maintenance": "Underhåll",
      "other": "Övrigt"
    };
    const typeLabel = typeLabels[project.type as string] || project.type;

    // Formatera datum
    const timestamp = new Date().toLocaleString("sv-SE", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    // Formatera belopp
    const formatAmount = (amount: number | null) => {
      if (!amount) return "0 kr";
      return new Intl.NumberFormat("sv-SE", {
        style: "currency",
        currency: "SEK",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(amount);
    };

    const organization = project.property.organization || { name: "Er organisation", logo_url: null };

    // Skapa HTML-mall med enkel vänsterjusterad layout
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #000000;
      max-width: 800px;
      margin: 0;
      padding: 20px;
      background-color: #ffffff;
    }
    .content {
      text-align: left;
    }
    p {
      margin: 0 0 16px 0;
    }
    .section {
      margin: 24px 0;
    }
    strong {
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="content">
    <p>Hej,</p>
    <p>Hoppas allt är bra!</p>
    
    <p>Vi önskar härmed beställa arbetet avseende <strong>${project.name}</strong> på fastigheten <strong>${project.property.name}${project.property.address ? ', ' + project.property.address : ''}</strong>.</p>
    
    ${project.description ? `<p>Åtgärden omfattar ${project.description}.</p>` : ''}
    
    <p>Arbetet planeras att utföras under <strong>${project.year || 'ej angivet'} Q${project.start_quarter || '?'}</strong>.</p>
    
    <div class="section">
      <p><strong>Projektnamn:</strong> ${project.name}</p>
      <p><strong>Projektnummer:</strong> ${project.project_number || 'Ej tilldelat'}</p>
    </div>
    
    <div class="section">
      <p><strong>Fakturering sker till:</strong></p>
      <p style="white-space: pre-line;">${project.property.invoice_address || project.property.address || 'Ej angiven'}</p>
      
      <p><strong>Märkning:</strong> ${project.property.property_number || 'Ej angivet'} + Kontonummer</p>
      <p><strong>Faktura skickas till:</strong> scanning@retta.se</p>
    </div>
    
    ${contact ? `
    <div class="section">
      <p><strong>För frågor kring det praktiska arbetet eller tillgång till fastigheten, vänligen kontakta:</strong></p>
      <p>${contact.name}${contact.role ? ' (' + contact.role + ')' : ''}</p>
      ${contact.phone ? `<p><strong>Telefon:</strong> ${contact.phone}</p>` : ''}
      ${contact.email ? `<p><strong>E-post:</strong> <a href="mailto:${contact.email}">${contact.email}</a></p>` : ''}
    </div>
    ` : ''}
    
    <div class="section">
      <p>Vänligen bekräfta mottagandet av denna beställning samt återkom med preliminärt startdatum och planerad tidsåtgång.</p>
      <p>Arbetet ska utföras enligt gällande rutiner och säkerhetsföreskrifter.</p>
    </div>
    
    <p>Tack på förhand.</p>
    
    <div class="section" style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
      <p>Detta meddelande är skickat från ${organization.name}</p>
      <p>Genererat ${timestamp}</p>
    </div>
  </div>
</body>
</html>
    `;

    console.log("Skickar projektbeställning till:", userEmail);

    const emailResponse = await resend.emails.send({
      from: "Fastighetssystem <onboarding@resend.dev>",
      to: [userEmail],
      subject: `Beställning – ${project.description || project.name} ${project.property.name} ${project.project_number || ''}`,
      html: htmlContent,
    });

    console.log("E-post skickad:", emailResponse);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Beställningsutkast skickat"
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Error i send-project-order-draft:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Kunde inte skicka beställningsutkast" 
      }),
      {
        status: 500,
        headers: { 
          "Content-Type": "application/json", 
          ...corsHeaders 
        },
      }
    );
  }
};

serve(handler);
