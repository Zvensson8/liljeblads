import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId } = await req.json();

    if (!projectId) {
      return new Response(JSON.stringify({ error: "projectId krävs" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: project, error: pError } = await supabaseClient
      .from("projects")
      .select(`
        *,
        property:properties (
          id, name, property_number, address, invoice_address,
          organization:organizations (name)
        )
      `)
      .eq("id", projectId)
      .single();

    if (pError || !project) {
      throw new Error("Projekt hittades inte");
    }

    const { data: contacts } = await supabaseClient
      .from("property_contacts")
      .select("*")
      .eq("property_id", project.property?.id)
      .limit(1);

    const contact = contacts?.[0] || null;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const orgName = project.property?.organization?.name || "Vår organisation";
    const propertyName = project.property?.name || "Fastigheten";
    const propertyAddress = project.property?.address || "";
    const invoiceAddress = project.property?.invoice_address || project.property?.address || "";
    const propertyNumber = project.property?.property_number || "";
    const contactInfo = contact
      ? `Kontaktperson: ${contact.name}${contact.role ? ` (${contact.role})` : ""}${contact.phone ? `, tel: ${contact.phone}` : ""}${contact.email ? `, e-post: ${contact.email}` : ""}`
      : "";

    const prompt = `Du är en professionell fastighetsförvaltare som skriver beställningar till entreprenörer. Skriv en tydlig och professionell beställningstext på svenska baserat på följande projektinformation:

Organisation: ${orgName}
Fastighet: ${propertyName}${propertyAddress ? `, ${propertyAddress}` : ""}
Projektnamn: ${project.name}
Projektnummer: ${project.project_number || "Ej tilldelat"}
${project.description ? `Beskrivning: ${project.description}` : ""}
${project.budget ? `Budget: ${project.budget} kr` : ""}
${project.start_date ? `Startdatum: ${project.start_date}` : ""}
${project.end_date ? `Slutdatum: ${project.end_date}` : ""}
${project.project_manager ? `Projektansvarig: ${project.project_manager}` : ""}
Fastighetsnummer: ${propertyNumber}
Fakturaadress: ${invoiceAddress}
${contactInfo}

Skriv texten som ett e-postmeddelande. Inkludera:
1. Hälsningsfras
2. Tydlig beskrivning av projektet/arbetet som beställs
3. Tidsplan om angivet
4. Faktureringsuppgifter (fakturaadressen, märkning med fastighetsnummer + kontonummer, faktura skickas till scanning@retta.se)
5. Kontaktuppgifter för praktiska frågor (om kontaktperson finns)
6. Be om bekräftelse och preliminärt startdatum
7. Avslut

Skriv ENBART beställningstexten, inget annat. Använd ren text utan markdown-formatering.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Du skriver professionella beställningstexter för fastighetsförvaltning på svenska." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Förfrågan begränsad, försök igen senare." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI-generering misslyckades");
    }

    const aiData = await response.json();
    const generatedText = aiData.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ text: generatedText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-project-order-text error:", e.message);
    return new Response(JSON.stringify({ error: e.message || "Okänt fel" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
