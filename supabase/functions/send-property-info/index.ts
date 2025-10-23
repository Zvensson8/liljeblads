import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
        <p style="margin-bottom: 20px;">Hej,</p>
        
        ${main_contact ? `
        <p style="margin: 0;"><strong>Kontaktuppgifter Drifttekniker:</strong></p>
        <p style="margin: 0;">${main_contact.name || ''}</p>
        <p style="margin: 0;">${main_contact.phone || ''}</p>
        <p style="margin: 0; margin-bottom: 20px;">${main_contact.email || ''}</p>
        ` : ''}
        
        <p style="margin-bottom: 20px;"><strong>Fastighetens Adress:</strong> ${property_address || ''}</p>
        
        <p style="margin: 0;"><strong>Fakturaadress:</strong></p>
        <p style="margin: 0; white-space: pre-line;">${invoice_address || ''}</p>
        
        <p style="margin-top: 20px; margin-bottom: 5px;"><strong>Bolag:</strong> ${property_name}</p>
        <p style="margin: 0; margin-bottom: 20px;"><strong>Fastighet:</strong> ${property_name}</p>
        
        <p style="margin: 0;">Faktura skickas till Scanning@retta.se</p>
      </div>
    `;

    const emailResponse = await resend.emails.send({
      from: "Fastighetssystem <onboarding@resend.dev>",
      to: [recipient_email],
      subject: `Kontaktuppgifter - ${property_name}`,
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
