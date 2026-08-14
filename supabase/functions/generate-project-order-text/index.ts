import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { searchKnowledgeBase } from "../_shared/knowledgeBaseSearch.ts";
import { chatText } from "../_shared/llmClient.ts";
import {
  assertOrgMember,
  requireUser,
  serviceRoleClient,
} from "../_shared/requireUser.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authed = await requireUser(req, corsHeaders);
    if ("response" in authed) return authed.response;

    const { projectId } = await req.json();

    if (!projectId) {
      return new Response(JSON.stringify({ error: "projectId krävs" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = serviceRoleClient();

    const { data: project, error: pError } = await supabaseClient
      .from("projects")
      .select(`
        *,
        property:properties (
          id, name, property_number, address, invoice_address, organization_id,
          organization:organizations (id, name)
        )
      `)
      .eq("id", projectId)
      .single();

    if (pError || !project) {
      throw new Error("Projekt hittades inte");
    }

    const orgId =
      project.property?.organization?.id || project.property?.organization_id;
    const denied = await assertOrgMember(
      supabaseClient,
      authed.user.id,
      orgId,
      corsHeaders,
    );
    if (denied) return denied;

    const { data: contacts } = await supabaseClient
      .from("property_contacts")
      .select("*")
      .eq("property_id", project.property?.id)
      .limit(1);

    const contact = contacts?.[0] || null;

    // Search knowledge base for relevant ABT06/industry context
    const searchQuery = `beställning projekt entreprenad ${project.name || ""} ${project.description || ""}`;
    const knowledgeContext = await searchKnowledgeBase(searchQuery, 4);

    const orgName = project.property?.organization?.name || "Vår organisation";
    const propertyName = project.property?.name || "Fastigheten";
    const propertyAddress = project.property?.address || "";
    const invoiceAddress = project.property?.invoice_address || project.property?.address || "";
    const propertyNumber = project.property?.property_number || "";
    const contactInfo = contact
      ? `Kontaktperson: ${contact.name}${contact.role ? ` (${contact.role})` : ""}${contact.phone ? `, tel: ${contact.phone}` : ""}${contact.email ? `, e-post: ${contact.email}` : ""}`
      : "";

    const knowledgeSection = knowledgeContext
      ? `\n\nRelevant branschkunskap (ABT06 m.m.) att referera till vid behov:\n${knowledgeContext}`
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
${contactInfo}${knowledgeSection}

Skriv texten som ett e-postmeddelande. Inkludera:
1. Hälsningsfras
2. Tydlig beskrivning av projektet/arbetet som beställs
3. Om relevant, referera till tillämpliga bestämmelser (t.ex. ABT06) för att förtydliga ansvar, garantier och entreprenadform
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
    console.error("generate-project-order-text error:", e.message);
    return new Response(JSON.stringify({ error: e.message || "Okänt fel" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
