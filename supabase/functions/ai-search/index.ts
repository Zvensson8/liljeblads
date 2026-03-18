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

// Generate query embedding using Google text-embedding-004
async function generateQueryEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY');
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY is not configured');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_QUERY',
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google Embedding API error [${response.status}]: ${errorBody}`);
  }

  const data = await response.json();
  return data.embedding.values;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
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
      console.error('Auth validation failed:', userError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = userData.user.id;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's organization
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.organization_id) {
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const verifiedOrgId = profile.organization_id;

    const { 
      query, 
      filterTables, 
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

    console.log(`AI Search: "${query}" | org: ${verifiedOrgId}`);

    // Generate query embedding using Google text-embedding-004
    const queryEmbedding = await generateQueryEmbedding(query);
    console.log(`Generated query embedding (${queryEmbedding.length} dimensions)`);

    // Use the ranked semantic search DB function
    const { data: searchResults, error: searchError } = await supabase.rpc('semantic_search_ranked', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.3,
      match_count: matchCount,
      org_id: verifiedOrgId,
      filter_tables: filterTables || null,
      boost_recent: boostRecent,
      boost_popular: boostPopular,
    });

    if (searchError) {
      console.error('Semantic search error:', searchError);
      throw searchError;
    }

    console.log(`Found ${searchResults?.length || 0} semantic results`);

    // Enrich results with details
    const enrichedResults = await enrichResults(supabase, searchResults || []);

    // Update access stats for top results (fire and forget)
    enrichedResults.slice(0, 5).forEach(result => {
      supabase
        .from('embeddings')
        .update({ last_accessed_at: new Date().toISOString() })
        .eq('source_table', result.source_table)
        .eq('source_id', result.source_id)
        .then(() => {});
    });

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
      final_score: result.final_score,
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
          property:properties(id, name)
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
