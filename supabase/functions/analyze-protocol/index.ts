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
    const { documentId, documentType, componentId } = await req.json();
    
    if (!documentId || !documentType) {
      throw new Error('documentId and documentType are required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authorization header required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    
    if (userError || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'Session expired' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = userData.user.id;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();

    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch document and component info
    let documentContent = '';
    let componentInfo: any = null;
    let propertyId: string | null = null;

    if (documentType === 'component_documents') {
      const { data: doc, error: docError } = await supabase
        .from('component_documents')
        .select(`
          id, name, file_url, mime_type,
          component:components(
            id, name, type, manufacturer, model, serial_number, notes, status,
            property:properties(id, name, organization_id)
          )
        `)
        .eq('id', documentId)
        .single();

      if (docError || !doc) {
        throw new Error('Document not found');
      }

      // Handle the joined data - component is an object, property is nested
      const component = doc.component as any;
      componentInfo = component;
      
      // Property is returned as first element of array or as object depending on Supabase version
      const property = Array.isArray(component?.property) ? component?.property[0] : component?.property;
      propertyId = property?.id || null;

      // Check organization access
      if (property?.organization_id !== profile.organization_id) {
        return new Response(JSON.stringify({ error: 'Access denied' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Set property info for context
      if (componentInfo) {
        componentInfo.property = property;
      }

      // Try to get parsed content from embeddings
      const { data: embedding } = await supabase
        .from('embeddings')
        .select('content')
        .eq('source_table', 'component_documents')
        .eq('source_id', documentId)
        .single();

      if (embedding?.content) {
        documentContent = embedding.content;
      } else {
        // Try to parse PDF directly
        if (doc.file_url && (doc.name?.toLowerCase().endsWith('.pdf') || doc.mime_type === 'application/pdf')) {
          try {
            console.log(`Parsing PDF: ${doc.name}`);
            const parseResponse = await fetch(`${supabaseUrl}/functions/v1/parse-document`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: doc.file_url, maxPages: 10 })
            });
            
            if (parseResponse.ok) {
              const parsed = await parseResponse.json();
              if (parsed.text) {
                documentContent = parsed.text;
              }
            }
          } catch (e) {
            console.error('Error parsing PDF:', e);
          }
        }
      }
    }

    if (!documentContent) {
      documentContent = 'Dokumentinnehåll kunde inte extraheras. Basera förslag på komponentinformation.';
    }

    // Prepare context for AI
    const context = `
KOMPONENTINFORMATION:
- Namn: ${componentInfo?.name || 'Okänd'}
- Typ: ${componentInfo?.type || 'Okänd'}
- Tillverkare: ${componentInfo?.manufacturer || 'Okänd'}
- Modell: ${componentInfo?.model || 'Okänd'}
- Serienummer: ${componentInfo?.serial_number || 'Okänd'}
- Status: ${componentInfo?.status || 'Okänd'}
- Fastighet: ${componentInfo?.property?.name || 'Okänd'}
- Anteckningar: ${componentInfo?.notes || 'Inga'}

DOKUMENTINNEHÅLL (Serviceprotokoll):
${documentContent.substring(0, 8000)}
`;

    // Call Lovable AI to analyze and suggest actions
    const systemPrompt = `Du är en expert på fastighetsförvaltning och teknisk drift. 
Analysera serviceprotokollet och komponentinformationen för att identifiera:

1. ARBETSORDRAR - Akuta eller nödvändiga reparationer/åtgärder
2. ATT GÖRA - Uppföljningspunkter, kontroller, administrativa uppgifter
3. PROJEKTFÖRSLAG - Större investeringar, byten, uppgraderingar som kräver beslut

För varje förslag, ange:
- Tydlig beskrivning av åtgärden
- Prioritet (low/medium/high)
- Motivering baserad på protokollet
- Konfidensgrad (0-1) baserat på hur tydligt behovet framgår

Fokusera på:
- Avvikelser och mätvärden utanför normalintervall
- Rekommendationer från servicetekniker
- Komponenter som närmar sig slutet av sin livslängd
- Säkerhetsrisker
- Energieffektiviseringsmöjligheter`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: context }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'suggest_actions',
              description: 'Föreslå åtgärder baserat på serviceprotokollet',
              parameters: {
                type: 'object',
                properties: {
                  work_orders: {
                    type: 'array',
                    description: 'Föreslagna arbetsordrar',
                    items: {
                      type: 'object',
                      properties: {
                        action: { type: 'string', description: 'Beskrivning av åtgärden' },
                        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                        reasoning: { type: 'string', description: 'Motivering' },
                        confidence: { type: 'number', description: 'Konfidensgrad 0-1' }
                      },
                      required: ['action', 'priority', 'reasoning', 'confidence']
                    }
                  },
                  todos: {
                    type: 'array',
                    description: 'Föreslagna att-göra uppgifter',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string', description: 'Rubrik' },
                        description: { type: 'string', description: 'Beskrivning' },
                        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                        reasoning: { type: 'string', description: 'Motivering' },
                        confidence: { type: 'number', description: 'Konfidensgrad 0-1' }
                      },
                      required: ['title', 'priority', 'reasoning', 'confidence']
                    }
                  },
                  project_proposals: {
                    type: 'array',
                    description: 'Föreslagna projekt (större investeringar/byten)',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string', description: 'Projektnamn' },
                        description: { type: 'string', description: 'Beskrivning' },
                        type: { type: 'string', enum: ['investering', 'underhall', 'energi', 'annat'] },
                        estimated_budget: { type: 'number', description: 'Uppskattad budget i SEK' },
                        reasoning: { type: 'string', description: 'Motivering' },
                        confidence: { type: 'number', description: 'Konfidensgrad 0-1' }
                      },
                      required: ['name', 'description', 'type', 'reasoning', 'confidence']
                    }
                  }
                },
                required: ['work_orders', 'todos', 'project_proposals']
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'suggest_actions' } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'AI-tjänsten är överbelastad, försök igen senare' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI-krediter slut, kontakta administratör' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error('AI analysis failed');
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      console.error('No tool call in response:', JSON.stringify(aiData));
      return new Response(JSON.stringify({ suggestions: [], message: 'Inga förslag kunde genereras' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const suggestions = JSON.parse(toolCall.function.arguments);
    console.log('AI suggestions:', JSON.stringify(suggestions));

    // Store suggestions in ai_suggested_actions
    const actionsToInsert: any[] = [];

    // Work orders
    for (const wo of suggestions.work_orders || []) {
      if (wo.confidence >= 0.5) {
        actionsToInsert.push({
          organization_id: profile.organization_id,
          action_type: 'create_work_order',
          payload: {
            action: wo.action,
            priority: wo.priority,
            property_id: propertyId,
            component_id: componentId
          },
          confidence_score: wo.confidence,
          reasoning: wo.reasoning,
          source_document_id: documentId,
          source_document_type: documentType,
          status: 'pending'
        });
      }
    }

    // Todos
    for (const todo of suggestions.todos || []) {
      if (todo.confidence >= 0.5) {
        actionsToInsert.push({
          organization_id: profile.organization_id,
          action_type: 'create_todo',
          payload: {
            title: todo.title,
            description: todo.description,
            priority: todo.priority,
            property_id: propertyId
          },
          confidence_score: todo.confidence,
          reasoning: todo.reasoning,
          source_document_id: documentId,
          source_document_type: documentType,
          status: 'pending'
        });
      }
    }

    // Project proposals
    for (const proj of suggestions.project_proposals || []) {
      if (proj.confidence >= 0.5) {
        actionsToInsert.push({
          organization_id: profile.organization_id,
          action_type: 'create_project',
          payload: {
            name: proj.name,
            description: proj.description,
            type: proj.type,
            budget: proj.estimated_budget,
            property_id: propertyId,
            status: 'forslag' // New proposal status
          },
          confidence_score: proj.confidence,
          reasoning: proj.reasoning,
          source_document_id: documentId,
          source_document_type: documentType,
          status: 'pending'
        });
      }
    }

    // Insert all suggestions
    if (actionsToInsert.length > 0) {
      const { data: insertedActions, error: insertError } = await supabase
        .from('ai_suggested_actions')
        .insert(actionsToInsert)
        .select();

      if (insertError) {
        console.error('Error inserting actions:', insertError);
        throw insertError;
      }

      console.log(`Inserted ${insertedActions?.length || 0} AI suggestions`);

      return new Response(JSON.stringify({ 
        success: true,
        suggestions: insertedActions,
        summary: {
          work_orders: suggestions.work_orders?.length || 0,
          todos: suggestions.todos?.length || 0,
          project_proposals: suggestions.project_proposals?.length || 0,
          total_saved: insertedActions?.length || 0
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      suggestions: [],
      summary: { work_orders: 0, todos: 0, project_proposals: 0, total_saved: 0 },
      message: 'Inga åtgärder med tillräcklig konfidensgrad hittades'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze-protocol:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
