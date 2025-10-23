import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PropertyInfoRequest {
  property_name: string;
  property_address: string | null;
  invoice_address: string | null;
  main_contact: any;
  recipient_email: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      property_name, 
      property_address, 
      invoice_address, 
      main_contact,
      recipient_email 
    }: PropertyInfoRequest = await req.json();

    console.log('Sending property info email to:', recipient_email);

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333; border-bottom: 2px solid #0066cc; padding-bottom: 10px;">
          Fastighetsinformation: ${property_name}
        </h1>
        
        <div style="margin: 20px 0;">
          <h2 style="color: #0066cc; font-size: 18px;">Fastighetsadress</h2>
          <p style="color: #666; line-height: 1.6;">
            ${property_address || 'Ingen adress registrerad'}
          </p>
        </div>

        <div style="margin: 20px 0;">
          <h2 style="color: #0066cc; font-size: 18px;">Fakturaadress</h2>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; white-space: pre-wrap; color: #333;">
${invoice_address || 'Ingen fakturaadress registrerad'}
          </div>
        </div>

        ${main_contact ? `
        <div style="margin: 20px 0;">
          <h2 style="color: #0066cc; font-size: 18px;">Huvudkontakt</h2>
          <div style="background: #f5f5f5; padding: 15px; border-radius: 5px;">
            <p style="margin: 5px 0; color: #333;"><strong>Namn:</strong> ${main_contact.name}</p>
            ${main_contact.role ? `<p style="margin: 5px 0; color: #333;"><strong>Roll:</strong> ${main_contact.role}</p>` : ''}
            ${main_contact.company ? `<p style="margin: 5px 0; color: #333;"><strong>Företag:</strong> ${main_contact.company}</p>` : ''}
            ${main_contact.phone ? `<p style="margin: 5px 0; color: #333;"><strong>Telefon:</strong> ${main_contact.phone}</p>` : ''}
            ${main_contact.email ? `<p style="margin: 5px 0; color: #333;"><strong>E-post:</strong> ${main_contact.email}</p>` : ''}
          </div>
        </div>
        ` : `
        <div style="margin: 20px 0;">
          <h2 style="color: #0066cc; font-size: 18px;">Huvudkontakt</h2>
          <p style="color: #666;">Ingen kontaktperson registrerad</p>
        </div>
        `}

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
          <p style="color: #999; font-size: 12px;">
            Denna information skickades automatiskt från ditt fastighetssystem.
          </p>
        </div>
      </div>
    `;

    const emailResponse = await resend.emails.send({
      from: "Fastighetssystem <onboarding@resend.dev>",
      to: [recipient_email],
      subject: `Fastighetsinformation - ${property_name}`,
      html: emailHtml,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-property-info function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
