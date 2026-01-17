import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QueueItem {
  id: string;
  source_table: string;
  source_id: string;
  operation: string;
  organization_id: string;
}

interface ContentResult {
  content: string;
  organizationId: string | null;
}

// Simple hash-based embedding generator using content characteristics
// This creates a deterministic vector based on the text content
function generateSimpleEmbedding(text: string, dimensions: number = 768): number[] {
  const embedding = new Array(dimensions).fill(0);
  const normalizedText = text.toLowerCase();
  
  // Use character codes and positions to create a unique vector
  for (let i = 0; i < normalizedText.length; i++) {
    const charCode = normalizedText.charCodeAt(i);
    const position = i % dimensions;
    embedding[position] += charCode * (i + 1) * 0.0001;
  }
  
  // Add word-level features
  const words = normalizedText.split(/\s+/);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordHash = word.split('').reduce((acc, char, idx) => acc + char.charCodeAt(0) * (idx + 1), 0);
    const position = wordHash % dimensions;
    embedding[position] += 0.01 * (i + 1);
  }
  
  // Normalize the vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      embedding[i] = embedding[i] / magnitude;
    }
  }
  
  return embedding;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch unprocessed queue items (batch of 10)
    const { data: queueItems, error: queueError } = await supabase
      .from('embedding_queue')
      .select('*')
      .eq('processed', false)
      .is('error', null)
      .order('created_at', { ascending: true })
      .limit(10);

    if (queueError) {
      console.error('Error fetching queue:', queueError);
      throw queueError;
    }

    if (!queueItems || queueItems.length === 0) {
      console.log('No items in queue');
      return new Response(JSON.stringify({ message: 'No items to process' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing ${queueItems.length} queue items`);

    const results = [];

    for (const item of queueItems as QueueItem[]) {
      try {
        if (item.operation === 'delete' || item.operation === 'DELETE') {
          // Delete existing embedding
          const { error: deleteError } = await supabase
            .from('embeddings')
            .delete()
            .eq('source_table', item.source_table)
            .eq('source_id', item.source_id);

          if (deleteError) throw deleteError;

          // Mark as processed
          await supabase
            .from('embedding_queue')
            .update({ processed: true, processed_at: new Date().toISOString() })
            .eq('id', item.id);

          results.push({ id: item.id, status: 'deleted' });
          continue;
        }

        // Fetch content based on source table
        const contentResult = await getContentForEmbedding(supabase, item.source_table, item.source_id);
        
        if (!contentResult || !contentResult.content) {
          console.log(`No content found for ${item.source_table}:${item.source_id}`);
          await supabase
            .from('embedding_queue')
            .update({ processed: true, processed_at: new Date().toISOString(), error: 'No content found' })
            .eq('id', item.id);
          continue;
        }

        // Generate content hash
        const encoder = new TextEncoder();
        const data = encoder.encode(contentResult.content);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const contentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Check if embedding already exists with same hash
        const { data: existingEmbedding } = await supabase
          .from('embeddings')
          .select('id, content_hash')
          .eq('source_table', item.source_table)
          .eq('source_id', item.source_id)
          .single();

        if (existingEmbedding && existingEmbedding.content_hash === contentHash) {
          console.log(`Content unchanged for ${item.source_table}:${item.source_id}`);
          await supabase
            .from('embedding_queue')
            .update({ processed: true, processed_at: new Date().toISOString() })
            .eq('id', item.id);
          results.push({ id: item.id, status: 'unchanged' });
          continue;
        }

        // Generate embedding using simple hash-based approach
        console.log(`Generating embedding for ${item.source_table}:${item.source_id}`);
        const embedding = generateSimpleEmbedding(contentResult.content);

        // Upsert embedding
        const { error: upsertError } = await supabase
          .from('embeddings')
          .upsert({
            source_table: item.source_table,
            source_id: item.source_id,
            content: contentResult.content,
            content_hash: contentHash,
            embedding: JSON.stringify(embedding),
            organization_id: contentResult.organizationId || item.organization_id,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'source_table,source_id'
          });

        if (upsertError) throw upsertError;

        // Mark queue item as processed
        await supabase
          .from('embedding_queue')
          .update({ processed: true, processed_at: new Date().toISOString() })
          .eq('id', item.id);

        results.push({ id: item.id, status: 'embedded' });
        console.log(`Successfully embedded ${item.source_table}:${item.source_id}`);

      } catch (itemError) {
        console.error(`Error processing item ${item.id}:`, itemError);
        await supabase
          .from('embedding_queue')
          .update({ 
            error: itemError instanceof Error ? itemError.message : 'Unknown error',
            processed_at: new Date().toISOString()
          })
          .eq('id', item.id);
        results.push({ id: item.id, status: 'error', error: itemError });
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-embeddings:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function getContentForEmbedding(supabase: any, sourceTable: string, sourceId: string): Promise<ContentResult | null> {
  switch (sourceTable) {
    case 'properties': {
      const { data, error } = await supabase
        .from('properties')
        .select(`
          name, address, property_number, property_type, description, 
          construction_year, area_sqm, loa, organization_id
        `)
        .eq('id', sourceId)
        .single();
      
      if (error || !data) return null;
      
      const parts = [
        `Fastighet: ${data.name}`,
        data.property_number ? `Fastighetsnummer: ${data.property_number}` : '',
        data.address ? `Adress: ${data.address}` : '',
        data.property_type ? `Typ: ${data.property_type}` : '',
        data.construction_year ? `Byggår: ${data.construction_year}` : '',
        data.area_sqm ? `Area: ${data.area_sqm} m²` : '',
        data.loa ? `LOA: ${data.loa} m²` : '',
        data.description ? `Beskrivning: ${data.description}` : ''
      ].filter(Boolean);
      
      return {
        content: parts.join('. '),
        organizationId: data.organization_id || null
      };
    }

    case 'components': {
      const { data, error } = await supabase
        .from('components')
        .select(`
          name, type, manufacturer, model, supplier, notes, serial_number, room_zone,
          property:properties!inner(organization_id, name)
        `)
        .eq('id', sourceId)
        .single();
      
      if (error || !data) return null;
      
      const parts = [
        `Komponent: ${data.name}`,
        data.type ? `Typ: ${data.type}` : '',
        data.manufacturer ? `Tillverkare: ${data.manufacturer}` : '',
        data.model ? `Modell: ${data.model}` : '',
        data.supplier ? `Leverantör: ${data.supplier}` : '',
        data.serial_number ? `Serienummer: ${data.serial_number}` : '',
        data.room_zone ? `Rum/Zon: ${data.room_zone}` : '',
        data.notes ? `Anteckningar: ${data.notes}` : '',
        data.property?.name ? `Fastighet: ${data.property.name}` : ''
      ].filter(Boolean);
      
      return {
        content: parts.join('. '),
        organizationId: data.property?.organization_id || null
      };
    }

    case 'work_orders': {
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          action, comments, contractor, status,
          component:components!inner(
            name, type,
            property:properties!inner(organization_id, name)
          )
        `)
        .eq('id', sourceId)
        .single();
      
      if (error || !data) return null;
      
      const parts = [
        `Arbetsorder: ${data.action}`,
        data.status ? `Status: ${data.status}` : '',
        data.contractor ? `Entreprenör: ${data.contractor}` : '',
        data.comments ? `Kommentarer: ${data.comments}` : '',
        data.component?.name ? `Komponent: ${data.component.name}` : '',
        data.component?.type ? `Komponenttyp: ${data.component.type}` : '',
        data.component?.property?.name ? `Fastighet: ${data.component.property.name}` : ''
      ].filter(Boolean);
      
      return {
        content: parts.join('. '),
        organizationId: data.component?.property?.organization_id || null
      };
    }

    case 'projects': {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          name, description, type, status, project_number, project_manager,
          property:properties!inner(organization_id, name)
        `)
        .eq('id', sourceId)
        .single();
      
      if (error || !data) return null;
      
      const parts = [
        `Projekt: ${data.name}`,
        data.project_number ? `Projektnummer: ${data.project_number}` : '',
        data.type ? `Typ: ${data.type}` : '',
        data.status ? `Status: ${data.status}` : '',
        data.project_manager ? `Projektledare: ${data.project_manager}` : '',
        data.description ? `Beskrivning: ${data.description}` : '',
        data.property?.name ? `Fastighet: ${data.property.name}` : ''
      ].filter(Boolean);
      
      return {
        content: parts.join('. '),
        organizationId: data.property?.organization_id || null
      };
    }

    case 'property_todos': {
      const { data, error } = await supabase
        .from('property_todos')
        .select(`
          title, notes, category, priority,
          property:properties(organization_id, name)
        `)
        .eq('id', sourceId)
        .single();
      
      if (error || !data) return null;
      
      const parts = [
        `Att göra: ${data.title}`,
        data.category ? `Kategori: ${data.category}` : '',
        data.priority ? `Prioritet: ${data.priority}` : '',
        data.notes ? `Anteckningar: ${data.notes}` : '',
        data.property?.name ? `Fastighet: ${data.property.name}` : ''
      ].filter(Boolean);
      
      return {
        content: parts.join('. '),
        organizationId: data.property?.organization_id || null
      };
    }

    case 'drift_tasks': {
      const { data, error } = await supabase
        .from('drift_tasks')
        .select(`
          name, description, quarter, year, planned_count, reported_count,
          category:drift_categories(name),
          property:properties(organization_id, name)
        `)
        .eq('id', sourceId)
        .single();
      
      if (error || !data) return null;
      
      const parts = [
        `Driftuppgift: ${data.name}`,
        data.quarter ? `Kvartal: ${data.quarter}` : '',
        data.year ? `År: ${data.year}` : '',
        `Planerat: ${data.planned_count || 0}, Rapporterat: ${data.reported_count || 0}`,
        data.category?.name ? `Kategori: ${data.category.name}` : '',
        data.description ? `Beskrivning: ${data.description}` : '',
        data.property?.name ? `Fastighet: ${data.property.name}` : ''
      ].filter(Boolean);
      
      return {
        content: parts.join('. '),
        organizationId: data.property?.organization_id || null
      };
    }

    case 'maintenance_history': {
      const { data, error } = await supabase
        .from('maintenance_history')
        .select(`
          action_type, notes, performed_date, cost, supplier, category,
          component:components(
            name, type,
            property:properties(organization_id, name)
          )
        `)
        .eq('id', sourceId)
        .single();
      
      if (error || !data) return null;
      
      const parts = [
        `Underhållshistorik: ${data.action_type}`,
        data.performed_date ? `Utfört: ${data.performed_date}` : '',
        data.cost ? `Kostnad: ${data.cost} kr` : '',
        data.supplier ? `Leverantör: ${data.supplier}` : '',
        data.category ? `Kategori: ${data.category}` : '',
        data.notes ? `Anteckningar: ${data.notes}` : '',
        data.component?.name ? `Komponent: ${data.component.name}` : '',
        data.component?.property?.name ? `Fastighet: ${data.component.property.name}` : ''
      ].filter(Boolean);
      
      return {
        content: parts.join('. '),
        organizationId: data.component?.property?.organization_id || null
      };
    }

    default:
      return null;
  }
}
