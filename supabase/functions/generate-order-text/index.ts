import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { searchKnowledgeBase } from "../_shared/knowledgeBaseSearch.ts";
import { chatText } from "../_shared/llmClient.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { workOrderId } = await req.json();

    if (!workOrderId) {
      return new Response(JSON.stringify({ error: "workOrderId krävs" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: workOrder, error: woError } = await supabaseClient
      .from("work_orders")
      .select(`
        *,
        property:properties (
          id, name, property_number, address, invoice_address,
          organization:organizations (name)
        )
      `)
      .eq("id", workOrderId)
      .single();

    if (woError || !workOrder) {
      throw new Error("Arbetsorder hittades inte");
    }

    const { data: contacts } = await supabaseClient
      .from("property_contacts")
      .select("*")
      .eq("property_id", workOrder.property?.id)
      .limit(1);

    const contact = contacts?.[0] || null;

    // Search knowledge base for relevant ABT06/industry context
    const searchQuery = `beställning entreprenad ${workOrder.action || ""} ${workOrder.comments || ""}`;
    const knowledgeContext = await searchKnowledgeBase(searchQuery, 4);

    const orgName = workOrder.property?.organization?.name || "Vår organisation";
    const propertyName = workOrder.property?.name || "Fastigheten";
    const propertyAddress = workOrder.property?.address || "";
    const invoiceAddress = workOrder.property?.invoice_address || workOrder.property?.address || "";
    const propertyNumber = workOrder.property?.property_number || "";
    const contactInfo = contact
      ? `Kontaktperson: ${contact.name}${contact.role ? ` (${contact.role})` : ""}${contact.phone ? `, tel: ${contact.phone}` : ""}${contact.email ? `, e-post: ${contact.email}` : ""}`
      : "";

    const knowledgeSection = knowledgeContext
      ? `\n\nRelevant branschkunskap (ABT06 m.m.) att referera till vid behov:\n${knowledgeContext}`
      : "";

    const prompt = `Du är en professionell fastighetsförvaltare som skriver beställningar till entreprenörer. Skriv en tydlig och professionell beställningstext på svenska baserat på följande information:

Organisation: ${orgName}
Fastighet: ${propertyName}${propertyAddress ? `, ${propertyAddress}` : ""}
Åtgärd: ${workOrder.action}
${workOrder.comments ? `Beskrivning: ${workOrder.comments}` : ""}
${workOrder.quarter ? `Planerat kvartal: ${workOrder.quarter}` : ""}
${workOrder.price ? `Estimerat pris: ${workOrder.price} kr` : ""}
${workOrder.contractor ? `Entreprenör: ${workOrder.contractor}` : ""}
Fastighetsnummer: ${propertyNumber}
Fakturaadress: ${invoiceAddress}
${contactInfo}${knowledgeSection}

Skriv texten som ett e-postmeddelande. Inkludera:
1. Hälsningsfras
2. Tydlig beskrivning av arbetet som beställs
3. Om relevant, referera till tillämpliga bestämmelser (t.ex. ABT06) för att förtydliga ansvar och garantier
4. Tidsplan om angivet
5. Faktureringsuppgifter (fakturaadressen, märkning med fastighetsnummer + kontonummer, faktura skickas till scanning@innagroup.com)
6. Kontaktuppgifter för praktiska frågor (om kontaktperson finns)
7. Be om bekräftelse och preliminärt startdatum
8. Avslut

Skriv ENBART beställningstexten, inget annat. Använd ren text utan markdown-formatering.`;

    let generatedText: string;
    try {
      generatedText = await chatText(
        [
          {
            role: "system",
            content:
              "Du skriver professionella beställningstexter för fastighetsförvaltning på svenska. Du har kunskap om ABT06 och andra branschstandarder och refererar till dessa vid behov.",
          },
          { role: "user", content: prompt },
        ],
        { temperature: 0.3 },
      );
    } catch (aiErr) {
      const msg = aiErr instanceof Error ? aiErr.message : String(aiErr);
      console.error("LLM error:", msg);
      if (/429|RESOURCE_EXHAUSTED|rate/i.test(msg)) {
        return new Response(JSON.stringify({ error: "Förfrågan begränsad, försök igen senare." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI-generering misslyckades");
    }

    return new Response(JSON.stringify({ text: generatedText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("generate-order-text error:", e.message);
    return new Response(JSON.stringify({ error: e.message || "Okänt fel" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
