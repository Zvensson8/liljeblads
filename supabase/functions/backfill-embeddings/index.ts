import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BackfillRequest {
  tables?: string[];
  batchSize?: number;
  organizationId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      tables = ['components', 'work_orders', 'projects', 'property_todos'],
      batchSize = 100,
      organizationId
    }: BackfillRequest = await req.json().catch(() => ({}));

    console.log(`Starting backfill for tables: ${tables.join(', ')}`);

    const stats: Record<string, { queued: number; existing: number }> = {};

    for (const table of tables) {
      stats[table] = { queued: 0, existing: 0 };

      // Get existing embeddings for this table
      const { data: existingEmbeddings } = await supabase
        .from('embeddings')
        .select('source_id')
        .eq('source_table', table);

      const existingIds = new Set((existingEmbeddings || []).map(e => e.source_id));
      stats[table].existing = existingIds.size;

      // Get all records that need embedding
      let records: any[] = [];
      
      if (table === 'work_orders') {
        const { data, error } = await supabase
          .from(table)
          .select('id, component_id')
          .limit(batchSize);
        if (!error) records = data || [];
      } else {
        const { data, error } = await supabase
          .from(table)
          .select('id, property_id')
          .limit(batchSize);
        if (!error) records = data || [];
      }

      // Filter out records that already have embeddings
      const recordsToProcess = records.filter((r: any) => !existingIds.has(r.id));

      console.log(`${table}: ${recordsToProcess.length} records to process, ${existingIds.size} already embedded`);

      // Queue each record
      for (const record of recordsToProcess) {
        let orgId = organizationId;
        
        // Get organization ID from property if not provided
        if (!orgId) {
          let propertyId = record.property_id;
          
          // For work orders, get property_id through component
          if (table === 'work_orders' && record.component_id) {
            const { data: component } = await supabase
              .from('components')
              .select('property_id')
              .eq('id', record.component_id)
              .single();
            propertyId = component?.property_id;
          }

          if (propertyId) {
            const { data: property } = await supabase
              .from('properties')
              .select('organization_id')
              .eq('id', propertyId)
              .single();
            orgId = property?.organization_id;
          }
        }

        // Check if already in queue
        const { data: existingQueue } = await supabase
          .from('embedding_queue')
          .select('id')
          .eq('source_table', table)
          .eq('source_id', record.id)
          .eq('processed', false)
          .single();

        if (!existingQueue) {
          const { error: queueError } = await supabase
            .from('embedding_queue')
            .insert({
              source_table: table,
              source_id: record.id,
              operation: 'insert',
              organization_id: orgId
            });

          if (!queueError) {
            stats[table].queued++;
          }
        }
      }
    }

    // Calculate total
    const totalQueued = Object.values(stats).reduce((sum, s) => sum + s.queued, 0);
    const totalExisting = Object.values(stats).reduce((sum, s) => sum + s.existing, 0);

    console.log(`Backfill complete: ${totalQueued} queued, ${totalExisting} already embedded`);

    return new Response(JSON.stringify({ 
      message: 'Backfill complete',
      stats,
      totalQueued,
      totalExisting
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in backfill-embeddings:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
