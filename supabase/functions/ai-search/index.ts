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
  boostRecent?: boolean;
  boostPopular?: boolean;
}

interface SearchResult {
  id: string;
  source_table: string;
  source_id: string;
  content: string;
  similarity: number;
  recency_boost?: number;
  popularity_boost?: number;
  final_score?: number;
  details?: any;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the user's JWT token
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.error('Auth validation failed:', claimsError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.claims.sub;
    console.log(`Authenticated user: ${userId}`);

    // Use service role for data access but enforce organization scoping
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's organization from their verified profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.organization_id) {
      console.error('Profile lookup failed:', profileError);
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use the verified organization_id from the user's profile, not from request
    const verifiedOrgId = profile.organization_id;

    const { 
      query, 
      filterTables, 
      matchThreshold = 0.3, 
      matchCount = 20,
      boostRecent = true,
      boostPopular = true
    }: SearchRequest = await req.json();

    if (!query || query.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Query is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`AI Search: "${query}" | org: ${verifiedOrgId} | boostRecent: ${boostRecent} | boostPopular: ${boostPopular}`);

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

    // Perform semantic search with re-ranking using the verified organization ID
    const { data: searchResults, error: searchError } = await supabase.rpc('semantic_search_ranked', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
      org_id: verifiedOrgId,
      filter_tables: filterTables || null,
      boost_recent: boostRecent,
      boost_popular: boostPopular
    });

    if (searchError) {
      console.error('Search error:', searchError);
      // Fallback to basic search if ranked search fails
      const { data: fallbackResults, error: fallbackError } = await supabase.rpc('semantic_search', {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: matchCount,
        org_id: verifiedOrgId,
        filter_tables: filterTables || null
      });
      
      if (fallbackError) throw fallbackError;
      
      // Use fallback results
      const enrichedFallback = await enrichResults(supabase, fallbackResults || []);
      return formatResponse(query, enrichedFallback);
    }

    console.log(`Found ${searchResults?.length || 0} results with re-ranking`);

    // Enrich results with additional details and update access stats
    const enrichedResults = await enrichResults(supabase, searchResults || []);

    // Update access stats for top results (for future re-ranking)
    const topResults = enrichedResults.slice(0, 5);
    for (const result of topResults) {
      await supabase.rpc('update_embedding_access', {
        p_source_table: result.source_table,
        p_source_id: result.source_id
      });
    }

    return formatResponse(query, enrichedResults);

  } catch (error) {
    console.error('Error in ai-search:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function formatResponse(query: string, results: SearchResult[]) {
  // Group results by source table
  const groupedResults = {
    properties: results.filter(r => r.source_table === 'properties'),
    components: results.filter(r => r.source_table === 'components'),
    work_orders: results.filter(r => r.source_table === 'work_orders'),
    projects: results.filter(r => r.source_table === 'projects'),
    property_todos: results.filter(r => r.source_table === 'property_todos'),
    drift_tasks: results.filter(r => r.source_table === 'drift_tasks'),
    maintenance_history: results.filter(r => r.source_table === 'maintenance_history'),
  };

  return new Response(JSON.stringify({ 
    query,
    totalResults: results.length,
    results,
    grouped: groupedResults
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function enrichResults(supabase: any, results: any[]): Promise<SearchResult[]> {
  const enrichedResults: SearchResult[] = [];
  
  for (const result of results) {
    const details = await getSourceDetails(supabase, result.source_table, result.source_id);
    enrichedResults.push({
      id: result.id,
      source_table: result.source_table,
      source_id: result.source_id,
      content: result.content,
      similarity: result.similarity,
      recency_boost: result.recency_boost,
      popularity_boost: result.popularity_boost,
      final_score: result.final_score || result.similarity,
      details
    });
  }
  
  return enrichedResults;
}

async function getSourceDetails(supabase: any, sourceTable: string, sourceId: string): Promise<any> {
  switch (sourceTable) {
    case 'properties': {
      const { data } = await supabase
        .from('properties')
        .select(`
          id, name, address, property_number, property_type, 
          construction_year, area_sqm, loa, description
        `)
        .eq('id', sourceId)
        .single();
      return data;
    }

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

    case 'drift_tasks': {
      const { data } = await supabase
        .from('drift_tasks')
        .select(`
          id, name, description, quarter, year, planned_count, reported_count,
          property:properties(id, name)
        `)
        .eq('id', sourceId)
        .single();
      return data;
    }

    case 'maintenance_history': {
      const { data } = await supabase
        .from('maintenance_history')
        .select(`
          id, action_type, performed_date, cost, supplier, notes,
          component:components(id, name, property:properties(id, name))
        `)
        .eq('id', sourceId)
        .single();
      return data;
    }

    default:
      return null;
  }
}
