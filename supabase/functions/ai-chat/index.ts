import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the last user message for context search
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop();
    let contextInfo = '';
    
    if (lastUserMessage?.content) {
      console.log('Searching for context:', lastUserMessage.content);
      
      try {
        // Extract search terms from the user message
        const searchTerms = extractSearchTerms(lastUserMessage.content);
        console.log('Extracted search terms:', searchTerms);
        
        // Search across all relevant tables
        const contextParts: string[] = [];
        
        // Search properties
        for (const term of searchTerms) {
          const { data: properties } = await supabase
            .from('properties')
            .select('*')
            .or(`name.ilike.%${term}%,address.ilike.%${term}%,property_number.ilike.%${term}%`)
            .limit(3);
          
          if (properties && properties.length > 0) {
            for (const p of properties) {
              // Also fetch related data for this property
              const [componentsResult, projectsResult, todosResult] = await Promise.all([
                supabase.from('components').select('*').eq('property_id', p.id).limit(5),
                supabase.from('projects').select('*').eq('property_id', p.id).limit(5),
                supabase.from('property_todos').select('*').eq('property_id', p.id).eq('completed', false).limit(5)
              ]);
              
              let propInfo = `📍 FASTIGHET: ${p.name}
- Fastighetsnummer: ${p.property_number || 'Ej angivet'}
- Adress: ${p.address || 'Ej angivet'}
- Typ: ${p.property_type || 'Ej angivet'}
- Byggår: ${p.construction_year || 'Ej angivet'}
- LOA: ${p.loa ? p.loa + ' m²' : 'Ej angivet'}
- Area: ${p.area_sqm ? p.area_sqm + ' m²' : 'Ej angivet'}`;

              if (componentsResult.data && componentsResult.data.length > 0) {
                propInfo += `\n\nKomponenter (${componentsResult.data.length} st):`;
                for (const c of componentsResult.data) {
                  propInfo += `\n  - ${c.name} (${c.type || 'okänd typ'}, status: ${c.status || 'okänd'})`;
                }
              }
              
              if (projectsResult.data && projectsResult.data.length > 0) {
                propInfo += `\n\nProjekt (${projectsResult.data.length} st):`;
                for (const pr of projectsResult.data) {
                  propInfo += `\n  - ${pr.name} (${pr.type || 'okänd typ'}, status: ${pr.status || 'okänd'})`;
                }
              }
              
              if (todosResult.data && todosResult.data.length > 0) {
                propInfo += `\n\nÖppna uppgifter (${todosResult.data.length} st):`;
                for (const t of todosResult.data) {
                  propInfo += `\n  - ${t.title}${t.priority ? ` (${t.priority})` : ''}`;
                }
              }
              
              contextParts.push(propInfo);
            }
          }
        }
        
        // Search components directly
        for (const term of searchTerms) {
          const { data: components } = await supabase
            .from('components')
            .select('*, property:properties(name, address)')
            .or(`name.ilike.%${term}%,type.ilike.%${term}%,manufacturer.ilike.%${term}%`)
            .limit(3);
          
          if (components && components.length > 0) {
            for (const c of components) {
              if (!contextParts.some(cp => cp.includes(c.name))) {
                contextParts.push(`🔧 KOMPONENT: ${c.name}
- Typ: ${c.type || 'Ej angivet'}
- Tillverkare: ${c.manufacturer || 'Ej angivet'}
- Modell: ${c.model || 'Ej angivet'}
- Status: ${c.status || 'Ej angivet'}
- Fastighet: ${c.property?.name || 'Ej angivet'}`);
              }
            }
          }
        }
        
        if (contextParts.length > 0) {
          contextInfo = `\n\nHär är relevant information från systemet:\n\n${contextParts.join('\n\n---\n\n')}`;
          console.log(`Found ${contextParts.length} context items`);
        } else {
          console.log('No matching data found in database');
        }
      } catch (searchError) {
        console.error('Search error:', searchError);
        // Continue without context if search fails
      }
    }

    console.log('Calling Lovable AI with context length:', contextInfo.length);

    const systemPrompt = `Du är en hjälpsam AI-assistent för ett fastighetsförvaltningssystem.
Du hjälper användare med frågor om:
- Fastigheter och deras information
- Komponenter (t.ex. ventilation, hissar, värmesystem)
- Projekt och underhållsarbeten
- Driftuppgifter och service
- Kostnader och budget
- Arbetsordrar

Svara alltid på svenska. Var koncis och hjälpsam. Basera dina svar på den information som finns i systemet.
${contextInfo}`;

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
          ...messages
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'För många förfrågningar. Försök igen om en stund.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Krediter slut. Lägg till mer i Lovable-inställningarna.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log('AI response received');
    
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

async function getSourceDetails(supabase: any, sourceTable: string, sourceId: string): Promise<any> {
  switch (sourceTable) {
    case 'properties': {
      const { data } = await supabase
        .from('properties')
        .select('*')
        .eq('id', sourceId)
        .single();
      return data;
    }
    case 'components': {
      const { data } = await supabase
        .from('components')
        .select('*, property:properties(name, address)')
        .eq('id', sourceId)
        .single();
      return data;
    }
    case 'projects': {
      const { data } = await supabase
        .from('projects')
        .select('*, property:properties(name)')
        .eq('id', sourceId)
        .single();
      return data;
    }
    case 'work_orders': {
      const { data } = await supabase
        .from('work_orders')
        .select('*, component:components(name, property:properties(name))')
        .eq('id', sourceId)
        .single();
      return data;
    }
    case 'property_todos': {
      const { data } = await supabase
        .from('property_todos')
        .select('*, property:properties(name)')
        .eq('id', sourceId)
        .single();
      return data;
    }
    default:
      return null;
  }
}

function formatDetails(sourceTable: string, details: any): string {
  switch (sourceTable) {
    case 'properties':
      return `📍 FASTIGHET: ${details.name}
- Fastighetsnummer: ${details.property_number || 'Ej angivet'}
- Adress: ${details.address || 'Ej angivet'}
- Typ: ${details.property_type || 'Ej angivet'}
- Byggår: ${details.construction_year || 'Ej angivet'}
- LOA: ${details.loa ? details.loa + ' m²' : 'Ej angivet'}
- Area: ${details.area_sqm ? details.area_sqm + ' m²' : 'Ej angivet'}
- Beskrivning: ${details.description || 'Ingen beskrivning'}`;
    
    case 'components':
      return `🔧 KOMPONENT: ${details.name}
- Typ: ${details.type || 'Ej angivet'}
- Tillverkare: ${details.manufacturer || 'Ej angivet'}
- Modell: ${details.model || 'Ej angivet'}
- Status: ${details.status || 'Ej angivet'}
- Fastighet: ${details.property?.name || 'Ej angivet'}`;
    
    case 'projects':
      return `📋 PROJEKT: ${details.name}
- Projektnummer: ${details.project_number || 'Ej angivet'}
- Typ: ${details.type || 'Ej angivet'}
- Status: ${details.status || 'Ej angivet'}
- Fastighet: ${details.property?.name || 'Ej angivet'}`;
    
    case 'work_orders':
      return `🛠️ ARBETSORDER: ${details.action}
- Status: ${details.status || 'Ej angivet'}
- Entreprenör: ${details.contractor || 'Ej angivet'}
- Komponent: ${details.component?.name || 'Ej angivet'}`;
    
    case 'property_todos':
      return `✅ ATT GÖRA: ${details.title}
- Prioritet: ${details.priority || 'Ej angivet'}
- Kategori: ${details.category || 'Ej angivet'}
- Slutförd: ${details.completed ? 'Ja' : 'Nej'}`;
    
    default:
      return JSON.stringify(details);
  }
}

// Extract meaningful search terms from user message
function extractSearchTerms(message: string): string[] {
  // Remove common Swedish question words and filler words
  const stopWords = [
    'berätta', 'om', 'vad', 'är', 'hur', 'kan', 'du', 'jag', 'vi', 'det', 'den', 'de',
    'ett', 'en', 'och', 'eller', 'för', 'med', 'på', 'i', 'av', 'till', 'från',
    'finns', 'har', 'hade', 'vara', 'bli', 'får', 'ska', 'vill', 'måste',
    'visa', 'ge', 'mig', 'information', 'data', 'uppgifter', 'detaljer',
    'fastigheten', 'komponenten', 'projektet', 'fastighet', 'komponent', 'projekt'
  ];
  
  // Split and filter
  const words = message
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1 && !stopWords.includes(word));
  
  // Also look for multi-word property names (e.g., "Automaten 11")
  const propertyNameMatch = message.match(/([A-ZÅÄÖ][a-zåäö]+\s*\d+)/gi);
  if (propertyNameMatch) {
    words.push(...propertyNameMatch.map(m => m.trim()));
  }
  
  // Remove duplicates
  return [...new Set(words)];
}