import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Validation schema — recipient_email from body is IGNORED (security)
const propertyInfoSchema = z.object({
  property_name: z.string().trim().min(1).max(200),
  property_number: z.string().trim().max(50).nullable(),
  property_address: z.string().trim().max(500).nullable(),
  invoice_address: z.string().trim().max(1000).nullable(),
  recipient_email: z.string().email().max(255).optional(),
  main_contact: z.object({
    name: z.string().trim().max(100).nullable().optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    email: z.union([z.string().email().max(255), z.literal("")]).nullable().optional()
  }).nullable().optional()
});

// HTML escaping function to prevent injection
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: only send to the signed-in user's email
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData?.user?.email) {
      return new Response(JSON.stringify({ error: "Session expired or no email on account" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const recipient_email = userData.user.email;

    // Validate input data
    const rawData = await req.json();
    const validatedData = propertyInfoSchema.parse(rawData);
    
    const { 
      property_name,
      property_number,
      property_address, 
      invoice_address, 
      main_contact,
    } = validatedData;

    const maskedEmail = recipient_email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
    console.log('Sending property info email to (self only):', maskedEmail);

    // Parse invoice address to get company name and org number (first two lines)
    const invoiceLines = invoice_address ? invoice_address.split('\n').filter(line => line.trim()) : [];
    const companyInfo = escapeHtml(invoiceLines.slice(0, 2).join(' - '));
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
        <p style="margin-bottom: 20px;">Hej,</p>
        
        ${main_contact ? `
        <p style="margin: 0;"><strong>Kontaktuppgifter Drifttekniker:</strong></p>
        <p style="margin: 0;">${escapeHtml(main_contact.name || '')}</p>
        <p style="margin: 0;">${escapeHtml(main_contact.phone || '')}</p>
        <p style="margin: 0; margin-bottom: 20px;">${escapeHtml(main_contact.email || '')}</p>
        ` : ''}
        
        <p style="margin-bottom: 20px;"><strong>Fastighetens Adress:</strong> ${escapeHtml(property_address || '')}</p>
        
        <p style="margin: 0;"><strong>Fakturaadress:</strong></p>
        <p style="margin: 0; white-space: pre-line;">${escapeHtml(invoice_address || '')}</p>
        
        <p style="margin-top: 20px; margin-bottom: 5px;"><strong>Bolag:</strong> ${companyInfo}</p>
        <p style="margin: 0; margin-bottom: 5px;"><strong>Fastighet:</strong> ${escapeHtml(property_name)}</p>
        <p style="margin: 0; margin-bottom: 20px;"><strong>Märkning:</strong> ${escapeHtml(property_number || property_name)} + Kontonummer</p>
        
        <p style="margin: 0;">Faktura skickas till Scanning@retta.se</p>
      </div>
    `;

    const emailResponse = await resend.emails.send({
      from: "Fastighetssystem <info@liljeblads.com>",
      to: [recipient_email],
      subject: `Kontaktuppgifter - ${escapeHtml(property_name)}`,
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
    console.error("Error in send-property-info function:", error.message || "Unknown error");
    
    // Handle validation errors specifically
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: "Invalid input data", details: error.errors }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }
    
    return new Response(
      JSON.stringify({ error: "Failed to send property information" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
