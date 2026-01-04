import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();

    const response = await fetch('https://llm.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `Du är en hjälpsam AI-assistent för ett fastighetsförvaltningssystem. 
Du hjälper användare med frågor om:
- Fastigheter och deras information
- Komponenter (t.ex. ventilation, hissar, värmesystem)
- Projekt och underhållsarbeten
- Driftuppgifter och service
- Kostnader och budget
- Arbetsordrar

Svara alltid på svenska. Var koncis och hjälpsam. Om du inte vet svaret, säg det ärligt.`
          },
          ...messages
        ],
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Lovable AI error:', data);
      throw new Error(data.error?.message || 'AI request failed');
    }

    const message = data.choices?.[0]?.message?.content || 'Kunde inte generera svar.';

    return new Response(JSON.stringify({ message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in ai-chat function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
