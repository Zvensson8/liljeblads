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

    // Verify the user's JWT token (robust against missing session)
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

    // Use the verified organization_id from the user's profile
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

    console.log(`AI Search: "${query}" | org: ${verifiedOrgId} | boostRecent: ${boostRecent} | boostPopular: ${boostPopular}`);

    // Perform text-based search on embeddings table
    const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    
    // Build search query
    let searchQuery = supabase
      .from('embeddings')
      .select('id, source_table, source_id, content, updated_at, access_count, boost_score')
      .eq('organization_id', verifiedOrgId);

    // Filter by tables if specified
    if (filterTables && filterTables.length > 0) {
      searchQuery = searchQuery.in('source_table', filterTables);
    }

    const { data: allEmbeddings, error: searchError } = await searchQuery.limit(500);

    if (searchError) {
      console.error('Search error:', searchError);
      throw searchError;
    }

    // Score and rank results based on text matching
    const scoredResults = (allEmbeddings || [])
      .map(embedding => {
        const contentLower = embedding.content.toLowerCase();
        
        // Calculate text match score
        let matchScore = 0;
        let exactMatch = false;
        
        // Check for exact phrase match
        if (contentLower.includes(query.toLowerCase())) {
          matchScore += 100;
          exactMatch = true;
        }
        
        // Check for individual term matches
        for (const term of searchTerms) {
          if (contentLower.includes(term)) {
            matchScore += 10;
            // Bonus for term appearing at the start
            if (contentLower.startsWith(term) || contentLower.includes(`: ${term}`)) {
              matchScore += 5;
            }
          }
        }
        
        // Calculate recency boost (items updated in last 30 days get boost)
        let recencyBoost = 0;
        if (boostRecent && embedding.updated_at) {
          const daysSinceUpdate = (Date.now() - new Date(embedding.updated_at).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceUpdate < 7) recencyBoost = 20;
          else if (daysSinceUpdate < 30) recencyBoost = 10;
          else if (daysSinceUpdate < 90) recencyBoost = 5;
        }
        
        // Calculate popularity boost
        let popularityBoost = 0;
        if (boostPopular) {
          popularityBoost = Math.min((embedding.access_count || 0) * 2, 20);
          popularityBoost += (embedding.boost_score || 0) * 5;
        }
        
        const finalScore = matchScore + recencyBoost + popularityBoost;
        
        return {
          ...embedding,
          matchScore,
          recencyBoost,
          popularityBoost,
          finalScore,
          similarity: matchScore / 100 // Normalize to 0-1 range
        };
      })
      .filter(r => r.matchScore > 0) // Only include results with matches
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, matchCount);

    console.log(`Found ${scoredResults.length} results`);

    // Enrich results with additional details
    const enrichedResults = await enrichResults(supabase, scoredResults);

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
      recency_boost: result.recencyBoost,
      popularity_boost: result.popularityBoost,
      final_score: result.finalScore,
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
