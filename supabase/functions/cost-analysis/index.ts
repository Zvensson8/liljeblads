import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const componentDataSchema = z.object({
  name: z.string().max(200),
  type: z.string().max(50),
  totalCost: z.number().nonnegative().optional(),
  maintenanceCount: z.number().int().nonnegative().optional(),
  lastMaintenanceDate: z.string().optional(),
  maintenanceHistory: z.array(z.any()).max(100).optional(),
  purchaseCost: z.number().nonnegative().optional(),
  totalMaintenanceCost: z.number().nonnegative().optional(),
  yearsInService: z.number().int().nonnegative().optional()
});

const requestSchema = z.object({
  componentData: componentDataSchema,
  analysisType: z.enum(['cost_prediction', 'maintenance_optimization', 'replacement_recommendation'])
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { componentData, analysisType } = requestSchema.parse(body);

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    let systemPrompt = '';
    let userPrompt = '';

    if (analysisType === 'cost_prediction') {
      systemPrompt = `Du är en expert på underhållskostnadsanalys för fastighetskomponenter. 
      Analysera historisk kostnadsdata och förutspå framtida kostnader baserat på mönster.
      Svara med en kort analys (max 3 meningar) och en siffra för förväntat kostnad nästa år.`;
      
      userPrompt = `Här är data för en komponent:
      Namn: ${componentData.name}
      Typ: ${componentData.type}
      Total kostnad senaste 12 mån: ${componentData.totalCost} SEK
      Antal underhåll: ${componentData.maintenanceCount}
      Senaste underhåll: ${componentData.lastMaintenanceDate || 'Okänt'}
      
      Vad blir den förväntade kostnaden för nästa år?`;
    } else if (analysisType === 'maintenance_optimization') {
      systemPrompt = `Du är en expert på underhållsplanering för fastigheter.
      Analysera underhållshistorik och ge rekommendationer för optimala serviceintervall.
      Svara med konkreta rekommendationer (max 4 meningar).`;
      
      userPrompt = `Här är underhållshistorik för en komponent:
      ${JSON.stringify(componentData.maintenanceHistory, null, 2)}
      
      Hur kan underhållsintervallen optimeras för att minska kostnader utan att riskera komponentens funktionalitet?`;
    } else if (analysisType === 'replacement_recommendation') {
      systemPrompt = `Du är en expert på livscykelkostnadsanalys (TCO) för fastighetskomponenter.
      Ge en rekommendation om komponenten bör repareras eller bytas ut baserat på kostnadsjämförelse.
      Svara med en tydlig rekommendation (max 3 meningar).`;
      
      userPrompt = `Här är data för en komponent:
      Inköpskostnad: ${componentData.purchaseCost || 'Okänd'} SEK
      Total underhållskostnad: ${componentData.totalMaintenanceCost} SEK
      År i drift: ${componentData.yearsInService}
      Antal underhåll: ${componentData.maintenanceCount}
      
      Bör komponenten bytas ut eller fortsätta repareras?`;
    } else {
      throw new Error('Invalid analysis type');
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway returned ${response.status}`);
    }

    const data = await response.json();
    const analysis = data.choices[0].message.content;

    return new Response(
      JSON.stringify({ analysis }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in cost-analysis function:', error);
    
    // Handle validation errors
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: 'Invalid input data' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    return new Response(
      JSON.stringify({ error: 'Unable to complete analysis' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
