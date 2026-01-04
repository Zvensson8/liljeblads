import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchRequest {
  query: string;
  organizationId?: string;
  filterTables?: string[];
  matchThreshold?: number;
  matchCount?: number;
}

interface SearchResult {
  id: string;
  source_table: string;
  source_id: string;
  content: string;
  similarity: number;
  details?: any;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      query, 
      organizationId, 
      filterTables, 
      matchThreshold = 0.3, 
      matchCount = 20 
    }: SearchRequest = await req.json();

    if (!query || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Searching for: "${query}" in org: ${organizationId || 'all'}`);

    // Generate embedding for the search query
    const embeddingResponse = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: query,
        dimensions: 768
      }),
    });

    if (!embeddingResponse.ok) {
      const errorText = await embeddingResponse.text();
      console.error('Embedding API error:', errorText);
      
      if (embeddingResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again later' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (embeddingResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required, please add funds' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`Embedding API error: ${embeddingResponse.status}`);
    }

    const embeddingData = await embeddingResponse.json();
    const queryEmbedding = embeddingData.data[0].embedding;

    // Perform semantic search using the database function
    const { data: searchResults, error: searchError } = await supabase.rpc('semantic_search', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
      org_id: organizationId || null,
      filter_tables: filterTables || null
    });

    if (searchError) {
      console.error('Search error:', searchError);
      throw searchError;
    }

    console.log(`Found ${searchResults?.length || 0} results`);

    // Enrich results with additional details
    const enrichedResults: SearchResult[] = [];
    
    for (const result of (searchResults || [])) {
      const details = await getSourceDetails(supabase, result.source_table, result.source_id);
      enrichedResults.push({
        ...result,
        details
      });
    }

    // Group results by source table
    const groupedResults = {
      components: enrichedResults.filter(r => r.source_table === 'components'),
      work_orders: enrichedResults.filter(r => r.source_table === 'work_orders'),
      projects: enrichedResults.filter(r => r.source_table === 'projects'),
      property_todos: enrichedResults.filter(r => r.source_table === 'property_todos'),
    };

    return new Response(JSON.stringify({ 
      query,
      totalResults: enrichedResults.length,
      results: enrichedResults,
      grouped: groupedResults
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-search:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function getSourceDetails(supabase: any, sourceTable: string, sourceId: string): Promise<any> {
  switch (sourceTable) {
    case 'components': {
      const { data } = await supabase
        .from('components')
        .select(`
          id, name, type, manufacturer, model, status,
          property:properties(id, name, address)
        `)
        .eq('id', sourceId)
        .single();
      return data;
    }

    case 'work_orders': {
      const { data } = await supabase
        .from('work_orders')
        .select(`
          id, action, status, contractor, created_at,
          component:components(id, name, property:properties(id, name))
        `)
        .eq('id', sourceId)
        .single();
      return data;
    }

    case 'projects': {
      const { data } = await supabase
        .from('projects')
        .select(`
          id, name, project_number, type, status,
          property:properties(id, name)
        `)
        .eq('id', sourceId)
        .single();
      return data;
    }

    case 'property_todos': {
      const { data } = await supabase
        .from('property_todos')
        .select(`
          id, title, category, priority, completed, due_date,
          property:properties(id, name)
        `)
        .eq('id', sourceId)
        .single();
      return data;
    }

    default:
      return null;
  }
}
