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

    // Skapa HTML-mall
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: #1f2937;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f9fafb;
    }
    .container {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
    }
    .header {
      text-align: center;
      padding: 32px 20px;
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
    }
    .header img {
      max-height: 60px;
      margin-bottom: 16px;
    }
    .header h1 {
      margin: 0;
      font-size: 28px;
      font-weight: 600;
    }
    .content {
      padding: 32px;
    }
    h2 {
      color: #1f2937;
      font-size: 20px;
      font-weight: 600;
      margin-top: 32px;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e5e7eb;
    }
    h2:first-child {
      margin-top: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    th {
      background: #f3f4f6;
      text-align: left;
      padding: 12px;
      font-weight: 600;
      color: #374151;
      width: 40%;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    tr:last-child td {
      border-bottom: none;
    }
    .description-box {
      padding: 16px;
      background: #f9fafb;
      border-left: 4px solid #3b82f6;
      border-radius: 4px;
      margin-bottom: 24px;
      white-space: pre-wrap;
    }
    .footer {
      margin-top: 32px;
      padding: 24px;
      background: #f3f4f6;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }
    .footer p {
      margin: 4px 0;
      color: #6b7280;
      font-size: 14px;
    }
    .footer .timestamp {
      font-size: 12px;
      color: #9ca3af;
    }
    @media only screen and (max-width: 600px) {
      body {
        padding: 10px;
      }
      .content {
        padding: 20px;
      }
      th, td {
        padding: 8px;
        font-size: 14px;
      }
      h2 {
        font-size: 18px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${organization.logo_url ? `<img src="${organization.logo_url}" alt="${organization.name}" />` : ''}
      <h1>Projektbeställning</h1>
    </div>
    
    <div class="content">
      <h2>Projektinformation</h2>
      <table>
        <tr>
          <th>Projektnummer</th>
          <td>${project.project_number || 'Ej tilldelat'}</td>
        </tr>
        <tr>
          <th>Projektnamn</th>
          <td>${project.name}</td>
        </tr>
        <tr>
          <th>Projekttyp</th>
          <td>${typeLabel}</td>
        </tr>
        <tr>
          <th>År och period</th>
          <td>${project.year || 'Ej angivet'} (Q${project.start_quarter || '?'} - Q${project.end_quarter || '?'})</td>
        </tr>
        <tr>
          <th>Projektledare</th>
          <td>${project.project_manager || 'Ej tilldelad'}</td>
        </tr>
      </table>

      <h2>Fastighetsinformation</h2>
      <table>
        <tr>
          <th>Fastighet</th>
          <td>${project.property.name}</td>
        </tr>
        <tr>
          <th>Fastighetsnummer</th>
          <td>${project.property.property_number || 'Ej angivet'}</td>
        </tr>
        <tr>
          <th>Adress</th>
          <td>${project.property.address || 'Ej angiven'}</td>
        </tr>
        <tr>
          <th>Fakturaadress</th>
          <td>${project.property.invoice_address || project.property.address || 'Ej angiven'}</td>
        </tr>
      </table>

      ${contact ? `
      <h2>Kontaktuppgifter</h2>
      <table>
        <tr>
          <th>Namn</th>
          <td>${contact.name}</td>
        </tr>
        ${contact.role ? `
        <tr>
          <th>Roll</th>
          <td>${contact.role}</td>
        </tr>
        ` : ''}
        ${contact.company ? `
        <tr>
          <th>Företag</th>
          <td>${contact.company}</td>
        </tr>
        ` : ''}
        ${contact.phone ? `
        <tr>
          <th>Telefon</th>
          <td>${contact.phone}</td>
        </tr>
        ` : ''}
        ${contact.email ? `
        <tr>
          <th>E-post</th>
          <td><a href="mailto:${contact.email}">${contact.email}</a></td>
        </tr>
        ` : ''}
      </table>
      ` : ''}

      <h2>Ekonomi</h2>
      <table>
        <tr>
          <th>Budget</th>
          <td>${formatAmount(project.budget)}</td>
        </tr>
        <tr>
          <th>Prognos</th>
          <td>${formatAmount(project.forecast)}</td>
        </tr>
        <tr>
          <th>Tidsperiod</th>
          <td>${project.year || 'Ej angivet'} Q${project.start_quarter || '?'} - Q${project.end_quarter || '?'}</td>
        </tr>
      </table>

      ${project.description ? `
      <h2>Omfattning och beskrivning</h2>
      <div class="description-box">${project.description}</div>
      ` : ''}
    </div>

    <div class="footer">
      <p>Detta utkast är genererat från <strong>${organization.name}</strong></p>
      <p class="timestamp">Genererat ${timestamp}</p>
    </div>
  </div>
</body>
</html>
    `;

    console.log("Skickar projektbeställning till:", userEmail);

    const emailResponse = await resend.emails.send({
      from: "Fastighetssystem <onboarding@resend.dev>",
      to: [userEmail],
      subject: `Projektbeställning - ${project.project_number || project.name}`,
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
