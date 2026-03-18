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

// Google text-embedding-004 via Generative AI API
async function generateGoogleEmbedding(text: string): Promise<number[]> {
  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY');
  if (!apiKey) {
    throw new Error('GOOGLE_AI_API_KEY is not configured');
  }

  // Truncate text to ~8000 chars to stay within token limits
  const truncatedText = text.length > 8000 ? text.substring(0, 8000) : text;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text: truncatedText }] },
        taskType: 'RETRIEVAL_DOCUMENT',
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
          const { error: deleteError } = await supabase
            .from('embeddings')
            .delete()
            .eq('source_table', item.source_table)
            .eq('source_id', item.source_id);

          if (deleteError) throw deleteError;

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
          
          // Check if source record exists
          const tableCheckResult = await checkSourceExists(supabase, item.source_table, item.source_id);
          
          if (!tableCheckResult) {
            // Source was deleted, mark as processed with "source_deleted" status
            await supabase
              .from('embedding_queue')
              .update({ 
                processed: true, 
                processed_at: new Date().toISOString(), 
                error: 'source_deleted' 
              })
              .eq('id', item.id);
            
            // Also delete any orphaned embedding
            await supabase
              .from('embeddings')
              .delete()
              .eq('source_table', item.source_table)
              .eq('source_id', item.source_id);
            
            results.push({ id: item.id, status: 'source_deleted' });
          } else {
            // Source exists but couldn't get content
            await supabase
              .from('embedding_queue')
              .update({ 
                processed: true, 
                processed_at: new Date().toISOString(), 
                error: 'No content found' 
              })
              .eq('id', item.id);
            results.push({ id: item.id, status: 'no_content' });
          }
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

        // Generate embedding
        console.log(`Generating embedding for ${item.source_table}:${item.source_id}`);
        const embedding = await generateGoogleEmbedding(contentResult.content);

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

// Check if source record exists
async function checkSourceExists(supabase: any, sourceTable: string, sourceId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from(sourceTable)
      .select('id')
      .eq('id', sourceId)
      .single();
    
    return !error && data !== null;
  } catch {
    return false;
  }
}

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
          property:properties!inner(organization_id, name)
        `)
        .eq('id', sourceId)
        .single();

      if (error || !data) return null;

      const parts = [
        `Arbetsorder: ${data.action}`,
        data.status ? `Status: ${data.status}` : '',
        data.contractor ? `Entreprenör: ${data.contractor}` : '',
        data.comments ? `Kommentarer: ${data.comments}` : '',
        data.property?.name ? `Fastighet: ${data.property.name}` : ''
      ].filter(Boolean);

      return {
        content: parts.join('. '),
        organizationId: data.property?.organization_id || null
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
          action_type, notes, performed_date, cost, supplier, category, drift_task_id,
          component:components(
            name, type, registration_number,
            property:properties(organization_id, name)
          ),
          drift_task:drift_tasks(name, quarter, year)
        `)
        .eq('id', sourceId)
        .single();
      
      if (error || !data) return null;
      
      const parts = [
        `[UNDERHÅLLSPOST] Åtgärdstyp: ${data.action_type}`,
        data.performed_date ? `Datum: ${data.performed_date}` : '',
        data.component?.name ? `Komponent: ${data.component.name}` : '',
        data.component?.registration_number ? `Reg.nr: ${data.component.registration_number}` : '',
        data.component?.type ? `Komponenttyp: ${data.component.type}` : '',
        data.cost ? `Kostnad: ${data.cost} kr` : '',
        data.supplier ? `Utförare/Leverantör: ${data.supplier}` : '',
        data.category ? `Kategori: ${data.category}` : '',
        data.notes ? `Noteringar: ${data.notes}` : '',
        data.drift_task?.name ? `Kopplad driftuppgift: ${data.drift_task.name} (${data.drift_task.quarter} ${data.drift_task.year})` : '',
        data.component?.property?.name ? `Fastighet: ${data.component.property.name}` : '',
        `OBS: För detaljerade mätvärden och avvikelser, se tillhörande SERVICEPROTOKOLL.`
      ].filter(Boolean);
      
      return {
        content: parts.join('. '),
        organizationId: data.component?.property?.organization_id || null
      };
    }

    case 'maintenance_history_documents': {
      const { data, error } = await supabase
        .from('maintenance_history_documents')
        .select(`
          file_name, file_url, mime_type,
          maintenance_history:maintenance_history!inner(
            id, action_type, performed_date, notes, supplier, cost, category, drift_task_id,
            component:components!inner(
              name, type, registration_number, manufacturer, model,
              property:properties!inner(organization_id, name)
            ),
            drift_task:drift_tasks(name, quarter, year)
          )
        `)
        .eq('id', sourceId)
        .single();
      
      if (error || !data) return null;

      const mh = data.maintenance_history;
      
      // Parse PDF content if it's a PDF file
      let pdfContent = '';
      if (data.file_url && (data.file_name?.toLowerCase().endsWith('.pdf') || data.mime_type === 'application/pdf')) {
        try {
          console.log(`Parsing PDF content for: ${data.file_name}`);
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const parseResponse = await fetch(`${supabaseUrl}/functions/v1/parse-document`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: data.file_url, maxPages: 10 })
          });
          
          if (parseResponse.ok) {
            const parsed = await parseResponse.json();
            if (parsed.text && parsed.text.length > 0) {
              pdfContent = parsed.text;
              console.log(`Extracted ${pdfContent.length} chars from PDF`);
            }
          }
        } catch (parseError) {
          console.error('Error parsing PDF:', parseError);
        }
      }
      
      const parts = [
        `[SERVICEPROTOKOLL] Dokument: ${data.file_name}`,
        mh?.performed_date ? `Servicedatum: ${mh.performed_date}` : '',
        mh?.component?.name ? `Komponent: ${mh.component.name}` : '',
        mh?.component?.registration_number ? `Registreringsnummer: ${mh.component.registration_number}` : '',
        mh?.component?.type ? `Komponenttyp: ${mh.component.type}` : '',
        mh?.component?.manufacturer ? `Tillverkare: ${mh.component.manufacturer}` : '',
        mh?.component?.model ? `Modell: ${mh.component.model}` : '',
        mh?.supplier ? `Servicetekniker/Företag: ${mh.supplier}` : '',
        mh?.drift_task?.name ? `Relaterad driftuppgift: ${mh.drift_task.name} (${mh.drift_task.quarter} ${mh.drift_task.year})` : '',
        mh?.component?.property?.name ? `Fastighet: ${mh.component.property.name}` : ''
      ].filter(Boolean);
      
      if (pdfContent) {
        parts.push(`\n\n=== PROTOKOLLINNEHÅLL (mätvärden, avvikelser, observationer) ===\n${pdfContent.substring(0, 8000)}`);
      }
      
      return {
        content: parts.join('. '),
        organizationId: mh?.component?.property?.organization_id || null
      };
    }

    case 'recurring_costs': {
      const { data, error } = await supabase
        .from('recurring_costs')
        .select(`
          description, amount, payment_interval, contractor_name, contractor_phone, contractor_email,
          property:properties(organization_id, name),
          account_code:account_codes(code, name)
        `)
        .eq('id', sourceId)
        .single();
      
      if (error || !data) return null;
      
      const intervalLabel = (interval: string) => {
        if (interval === 'monthly') return 'månadsvis';
        if (interval === 'quarterly') return 'kvartalsvis';
        if (interval === 'yearly') return 'årsvis';
        return interval;
      };
      
      const parts = [
        `Löpande kostnad: ${data.description}`,
        data.amount ? `Belopp: ${data.amount} kr` : '',
        data.payment_interval ? `Intervall: ${intervalLabel(data.payment_interval)}` : '',
        data.contractor_name ? `Leverantör: ${data.contractor_name}` : '',
        data.contractor_phone ? `Telefon: ${data.contractor_phone}` : '',
        data.contractor_email ? `E-post: ${data.contractor_email}` : '',
        data.account_code ? `Konto: ${data.account_code.code} - ${data.account_code.name}` : '',
        data.property?.name ? `Fastighet: ${data.property.name}` : ''
      ].filter(Boolean);
      
      return {
        content: parts.join('. '),
        organizationId: data.property?.organization_id || null
      };
    }

    case 'property_contacts': {
      const { data, error } = await supabase
        .from('property_contacts')
        .select(`
          name, role, company, phone, email,
          property:properties(organization_id, name)
        `)
        .eq('id', sourceId)
        .single();
      
      if (error || !data) return null;
      
      const parts = [
        `Kontakt: ${data.name}`,
        data.role ? `Roll: ${data.role}` : '',
        data.company ? `Företag: ${data.company}` : '',
        data.phone ? `Telefon: ${data.phone}` : '',
        data.email ? `E-post: ${data.email}` : '',
        data.property?.name ? `Fastighet: ${data.property.name}` : ''
      ].filter(Boolean);
      
      return {
        content: parts.join('. '),
        organizationId: data.property?.organization_id || null
      };
    }

    case 'property_notes': {
      const { data, error } = await supabase
        .from('property_notes')
        .select(`
          content, created_at,
          property:properties(organization_id, name)
        `)
        .eq('id', sourceId)
        .single();
      
      if (error || !data) return null;
      
      const parts = [
        `Anteckning: ${data.content}`,
        data.created_at ? `Skapad: ${data.created_at.split('T')[0]}` : '',
        data.property?.name ? `Fastighet: ${data.property.name}` : ''
      ].filter(Boolean);
      
      return {
        content: parts.join('. '),
        organizationId: data.property?.organization_id || null
      };
    }

    default:
      console.log(`Unknown source table: ${sourceTable}`);
      return null;
  }
}
