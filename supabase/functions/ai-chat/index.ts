import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Circuit breaker state (per-instance)
const circuitBreaker = {
  failures: 0,
  lastFailure: 0,
  isOpen: false,
  threshold: 5,
  resetTimeoutMs: 60000
};

function checkCircuitBreaker(): void {
  if (circuitBreaker.isOpen) {
    if (Date.now() - circuitBreaker.lastFailure > circuitBreaker.resetTimeoutMs) {
      circuitBreaker.isOpen = false;
      circuitBreaker.failures = 0;
      console.log('Circuit breaker reset');
    } else {
      throw new Error('AI-tjänsten är tillfälligt otillgänglig. Försök igen om en stund.');
    }
  }
}

function recordSuccess(): void {
  circuitBreaker.failures = 0;
  circuitBreaker.isOpen = false;
}

function recordFailure(): void {
  circuitBreaker.failures++;
  circuitBreaker.lastFailure = Date.now();
  if (circuitBreaker.failures >= circuitBreaker.threshold) {
    circuitBreaker.isOpen = true;
    console.error(`Circuit breaker opened after ${circuitBreaker.failures} failures`);
  }
}

// Retry utility with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: Error = new Error('No attempts made');
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on auth errors or rate limits
      const message = lastError.message.toLowerCase();
      if (message.includes('401') || message.includes('402') || message.includes('429')) {
        throw lastError;
      }
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500;
      console.log(`Retry ${attempt}/${maxAttempts} after ${Math.round(delay)}ms:`, lastError.message);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  
  throw lastError;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check circuit breaker before proceeding
    checkCircuitBreaker();

    const { messages, stream: streamRequested, conversationId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('Missing or invalid Authorization header');
      return new Response(JSON.stringify({ error: 'Authorization header required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the user's JWT token using getUser with token parameter
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const token = authHeader.replace('Bearer ', '');
    
    // Use getUser with the token to verify it
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    
    if (userError || !userData?.user?.id) {
      console.error('Auth validation failed:', userError);
      return new Response(JSON.stringify({ error: 'Session expired. Please log in again.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const userId = userData.user.id;
    console.log(`Authenticated user: ${userId}`);

    // Rate limiting: 20 requests per minute for ai-chat
    const rateResult = await checkRateLimit(userId, {
      endpoint: 'ai-chat',
      maxRequests: 20,
      windowSeconds: 60,
    });
    const rateLimited = rateLimitResponse(rateResult, corsHeaders);
    if (rateLimited) return rateLimited;

    // Use service role for data access
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

    // Use the verified organization_id to scope all queries
    const verifiedOrgId = profile.organization_id;

    // Get the last user message for context search
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop();
    let contextInfo = '';
    
    if (lastUserMessage?.content) {
      console.log('Searching for context:', lastUserMessage.content);
      
      try {
        // Extract search terms from the user message
        const searchTerms = extractSearchTerms(lastUserMessage.content);
        console.log('Extracted search terms:', searchTerms);
        
        // Parse time-based filters (Q1, Q2, 2024, 2025, etc.)
        const timeFilter = parseTimeFilter(lastUserMessage.content);
        console.log('Time filter:', timeFilter);
        
        const contextParts: string[] = [];
        const foundPropertyIds = new Set<string>();
        const foundComponentIds = new Set<string>();
        const foundProjectIds = new Set<string>();
        const foundMaintenanceIds = new Set<string>();
        const foundWorkOrderIds = new Set<string>();
        
        // Get all properties with full details for user's organization
        const { data: orgProperties } = await supabase
          .from('properties')
          .select('id, name, address, property_number, area_sqm, type, year_built, floors_count')
          .eq('organization_id', verifiedOrgId);
        const orgPropertyIds = orgProperties?.map(p => p.id) || [];
        const propertyNameMap = new Map(orgProperties?.map(p => [p.id, p.name]) || []);
        
        // Get all components with details for the organization's properties
        const { data: orgComponents } = await supabase
          .from('components')
          .select('id, name, property_id, type, status, manufacturer, model, installation_year, next_service_date')
          .in('property_id', orgPropertyIds);
        const orgComponentIds = orgComponents?.map(c => c.id) || [];
        const componentNameMap = new Map(orgComponents?.map(c => [c.id, c.name]) || []);
        const componentPropertyMap = new Map(orgComponents?.map(c => [c.id, c.property_id]) || []);
        
        // ============================================
        // OVERVIEW: Always include organization summary
        // ============================================
        if (orgProperties && orgProperties.length > 0) {
          let overview = `🏢 ORGANISATIONSÖVERSIKT:`;
          overview += `\n  Antal fastigheter: ${orgProperties.length}`;
          overview += `\n  Antal komponenter: ${orgComponentIds.length}`;
          for (const prop of orgProperties) {
            overview += `\n\n  📍 ${prop.name}`;
            if (prop.address) overview += ` — ${prop.address}`;
            if (prop.property_number) overview += ` (${prop.property_number})`;
            if (prop.area_sqm) overview += `\n    Yta: ${prop.area_sqm} m²`;
            if (prop.year_built) overview += `, Byggår: ${prop.year_built}`;
            if (prop.type) overview += `, Typ: ${prop.type}`;
            
            const propComponents = orgComponents?.filter(c => c.property_id === prop.id) || [];
            if (propComponents.length > 0) {
              overview += `\n    Komponenter (${propComponents.length}):`;
              for (const comp of propComponents.slice(0, 15)) {
                overview += `\n      - ${comp.name} (${comp.type || 'Ej angiven typ'})`;
                if (comp.status && comp.status !== 'active') overview += ` [${comp.status}]`;
                if (comp.next_service_date) overview += ` — nästa service: ${comp.next_service_date}`;
              }
              if (propComponents.length > 15) {
                overview += `\n      ... och ${propComponents.length - 15} fler`;
              }
            }
          }
          contextParts.push(overview);
        }

        // ============================================
        // SEMANTIC SEARCH: Use vector embeddings for relevance
        // ============================================
        try {
          const embeddingResponse = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'text-embedding-3-small',
              input: lastUserMessage.content,
            }),
          });
          
          if (embeddingResponse.ok) {
            const embeddingData = await embeddingResponse.json();
            const queryEmbedding = embeddingData?.data?.[0]?.embedding;
            
            if (queryEmbedding) {
              const { data: vectorResults, error: vecError } = await supabase.rpc('semantic_search_ranked', {
                query_embedding: JSON.stringify(queryEmbedding),
                match_threshold: 0.25,
                match_count: 20,
                org_id: verifiedOrgId,
                boost_recent: true,
                boost_popular: true
              });
              
              if (!vecError && vectorResults && vectorResults.length > 0) {
                console.log(`Semantic search returned ${vectorResults.length} results`);
                let semanticInfo = `🔎 SEMANTISK SÖKNING (mest relevant data för frågan):`;
                for (const r of vectorResults.slice(0, 12)) {
                  semanticInfo += `\n\n  [${r.source_table}] (relevans: ${(r.final_score * 100).toFixed(0)}%)`;
                  semanticInfo += `\n  ${r.content.substring(0, 500)}`;
                  
                  if (r.source_table === 'properties') foundPropertyIds.add(r.source_id);
                  if (r.source_table === 'components') foundComponentIds.add(r.source_id);
                  if (r.source_table === 'projects') foundProjectIds.add(r.source_id);
                  if (r.source_table === 'maintenance_history') foundMaintenanceIds.add(r.source_id);
                  if (r.source_table === 'work_orders') foundWorkOrderIds.add(r.source_id);
                }
                contextParts.push(semanticInfo);
              } else if (vecError) {
                console.error('Semantic search error:', vecError);
              }
            }
          } else {
            console.log('Embedding generation skipped, falling back to text search only');
          }
        } catch (semErr) {
          console.error('Semantic search failed:', semErr);
        }

        // ============================================
        // SEARCH 1: Maintenance History by Year/Terms
        // ============================================
        if (orgComponentIds.length > 0) {
          let maintenanceQuery = supabase
            .from('maintenance_history')
            .select('*, component:components(name, property_id, property:properties(name)), documents:maintenance_history_documents(id, file_name, file_url)')
            .in('component_id', orgComponentIds)
            .order('performed_date', { ascending: false });
          
          if (timeFilter.year) {
            const yearStart = `${timeFilter.year}-01-01`;
            const yearEnd = `${timeFilter.year}-12-31`;
            maintenanceQuery = maintenanceQuery.gte('performed_date', yearStart).lte('performed_date', yearEnd);
          }
          
          const { data: maintenanceRecords, error: maintenanceError } = await maintenanceQuery.limit(50);
          
          if (maintenanceError) {
            console.error('Maintenance search error:', maintenanceError);
          } else if (maintenanceRecords && maintenanceRecords.length > 0) {
            console.log(`Found ${maintenanceRecords.length} maintenance records`);
            
            const allDocIds = maintenanceRecords.flatMap(mh => 
              (mh.documents || []).map((d: any) => d.id)
            ).filter(Boolean);
            
            let docEmbeddings: any[] = [];
            if (allDocIds.length > 0) {
              const { data: embeddingsData } = await supabase
                .from('embeddings')
                .select('source_id, content')
                .eq('source_table', 'maintenance_history_documents')
                .in('source_id', allDocIds);
              docEmbeddings = embeddingsData || [];
              console.log(`Fetched ${docEmbeddings.length} document embeddings`);
            }
            
            let filteredRecords = maintenanceRecords;
            if (searchTerms.length > 0) {
              filteredRecords = maintenanceRecords.filter(mh => {
                const searchText = `${mh.action_type || ''} ${mh.notes || ''} ${mh.category || ''} ${mh.supplier || ''} ${mh.component?.name || ''}`.toLowerCase();
                return searchTerms.some(term => searchText.includes(term.toLowerCase()));
              });
            }
            
            if (filteredRecords.length > 0 || timeFilter.year) {
              const recordsByProperty = new Map<string, typeof maintenanceRecords>();
              for (const mh of filteredRecords.length > 0 ? filteredRecords : maintenanceRecords.slice(0, 20)) {
                foundMaintenanceIds.add(mh.id);
                const propId = mh.component?.property_id;
                if (propId) {
                  if (!recordsByProperty.has(propId)) {
                    recordsByProperty.set(propId, []);
                  }
                  recordsByProperty.get(propId)!.push(mh);
                }
              }
              
              for (const [propId, records] of recordsByProperty) {
                const propName = propertyNameMap.get(propId) || 'Okänd fastighet';
                let mhInfo = `🔧 UNDERHÅLLSHISTORIK FÖR ${propName.toUpperCase()}${timeFilter.year ? ` (${timeFilter.year})` : ''}:`;
                
                let totalCost = 0;
                for (const mh of records) {
                  mhInfo += `\n\n  ${mh.performed_date}: ${mh.action_type}`;
                  mhInfo += `\n    Komponent: ${mh.component?.name || 'Okänd'}`;
                  if (mh.category) mhInfo += `\n    Kategori: ${mh.category}`;
                  if (mh.cost) {
                    mhInfo += `\n    Kostnad: ${mh.cost.toLocaleString('sv-SE')} kr`;
                    totalCost += mh.cost;
                  }
                  if (mh.expected_cost) mhInfo += `\n    Förväntad kostnad: ${mh.expected_cost.toLocaleString('sv-SE')} kr`;
                  if (mh.supplier) mhInfo += `\n    Leverantör: ${mh.supplier}`;
                  if (mh.is_warranty) mhInfo += ` (Garanti)`;
                  if (mh.notes) mhInfo += `\n    Anteckningar: ${mh.notes}`;
                  
                  if (mh.documents && mh.documents.length > 0) {
                    mhInfo += `\n    📄 Bifogade dokument:`;
                    for (const doc of mh.documents) {
                      mhInfo += `\n      - ${doc.file_name}`;
                      
                      const docEmbedding = docEmbeddings.find(e => e.source_id === doc.id);
                      if (docEmbedding?.content) {
                        const contentMatch = docEmbedding.content.match(/(?:DOKUMENTINNEHÅLL|PROTOKOLLINNEHÅLL \(mätvärden, avvikelser, observationer\)|=== PROTOKOLLINNEHÅLL)[\s:=]*\n?([\s\S]+)/i);
                        if (contentMatch && contentMatch[1]) {
                          const docContent = contentMatch[1].trim().substring(0, 3000);
                          mhInfo += `\n        📋 SERVICEPROTOKOLL:\n        ${docContent.replace(/\n/g, '\n        ')}`;
                        } else if (docEmbedding.content.length > 200) {
                          mhInfo += `\n        📋 SERVICEPROTOKOLL:\n        ${docEmbedding.content.substring(200).trim().replace(/\n/g, '\n        ').substring(0, 2500)}`;
                        }
                      }
                    }
                  }
                }
                
                if (records.length > 1) {
                  mhInfo += `\n\n  TOTALT: ${totalCost.toLocaleString('sv-SE')} kr för ${records.length} åtgärder`;
                }
                
                contextParts.push(mhInfo);
              }
            }
          }
        }
        
        // ============================================
        // SEARCH 2: Work Orders by Year/Terms
        // ============================================
        if (orgPropertyIds.length > 0) {
          let workOrderQuery = supabase
            .from('work_orders')
            .select('*, property:properties(name)')
            .in('property_id', orgPropertyIds)
            .order('created_at', { ascending: false });
          
          if (timeFilter.year) {
            const yearStart = `${timeFilter.year}-01-01`;
            const yearEnd = `${timeFilter.year}-12-31`;
            workOrderQuery = workOrderQuery.or(`due_date.gte.${yearStart},created_at.gte.${yearStart}`);
          }
          
          const { data: workOrders, error: woError } = await workOrderQuery.limit(50);
          
          if (woError) {
            console.error('Work order year search error:', woError);
          } else if (workOrders && workOrders.length > 0) {
            let filteredOrders = workOrders;
            if (searchTerms.length > 0) {
              filteredOrders = workOrders.filter(wo => {
                const searchText = `${wo.action || ''} ${wo.comments || ''} ${wo.contractor || ''} ${wo.property?.name || ''}`.toLowerCase();
                return searchTerms.some(term => searchText.includes(term.toLowerCase()));
              });
            }
            
            const ordersToShow = filteredOrders.length > 0 ? filteredOrders : (timeFilter.year ? workOrders.slice(0, 20) : []);
            
            if (ordersToShow.length > 0) {
              console.log(`Found ${ordersToShow.length} work orders for year/terms`);
              
              const ordersByProperty = new Map<string, typeof workOrders>();
              for (const wo of ordersToShow) {
                foundWorkOrderIds.add(wo.id);
                const propId = wo.property_id;
                if (!ordersByProperty.has(propId)) {
                  ordersByProperty.set(propId, []);
                }
                ordersByProperty.get(propId)!.push(wo);
              }
              
              for (const [propId, orders] of ordersByProperty) {
                const propName = propertyNameMap.get(propId) || 'Okänd fastighet';
                let woInfo = `🛠️ ARBETSORDRAR FÖR ${propName.toUpperCase()}${timeFilter.year ? ` (${timeFilter.year})` : ''}:`;
                
                const statusLabel = (status: string) => {
                  if (status === 'not_started') return 'Ej påbörjad';
                  if (status === 'awaiting_quote') return 'Väntar på offert';
                  if (status === 'ordered') return 'Beställd';
                  if (status === 'completed') return 'Avslutad';
                  if (status === 'archived') return 'Arkiverad';
                  return status;
                };
                
                let totalPrice = 0;
                for (const wo of orders) {
                  woInfo += `\n\n  ${wo.action}`;
                  woInfo += `\n    Status: ${statusLabel(wo.status)}`;
                  if (wo.priority) woInfo += `, Prioritet: ${wo.priority}`;
                  if (wo.contractor) woInfo += `\n    Entreprenör: ${wo.contractor}`;
                  if (wo.due_date) woInfo += `\n    Deadline: ${wo.due_date}`;
                  if (wo.quarter) woInfo += `, Kvartal: ${wo.quarter}`;
                  if (wo.price) {
                    woInfo += `\n    Pris: ${wo.price.toLocaleString('sv-SE')} kr`;
                    totalPrice += wo.price;
                  }
                  if (wo.comments) woInfo += `\n    Kommentar: ${wo.comments}`;
                }
                
                if (orders.length > 1 && totalPrice > 0) {
                  woInfo += `\n\n  TOTALT: ${totalPrice.toLocaleString('sv-SE')} kr för ${orders.length} arbetsordrar`;
                }
                
                contextParts.push(woInfo);
              }
            }
          }
        }
        
        // ============================================
        // SEARCH 3: Projects by Quarter/Year
        // ============================================
        if ((timeFilter.quarter || timeFilter.year) && orgPropertyIds.length > 0) {
          console.log('Searching projects by time filter:', timeFilter);
          
          let query = supabase
            .from('projects')
            .select('*, property:properties(name), project_cost_items(*), project_checklist_items(*)')
            .in('property_id', orgPropertyIds);
          
          if (timeFilter.quarter) {
            query = query.eq('start_quarter', timeFilter.quarter);
          }
          if (timeFilter.year) {
            query = query.eq('year', timeFilter.year);
          }
          
          const { data: projects, error: projectsError } = await query.limit(30);
          
          if (projectsError) {
            console.error('Project time search error:', projectsError);
          } else if (projects && projects.length > 0) {
            console.log(`Found ${projects.length} projects for time filter`);
            
            const projectsByProperty = new Map<string, typeof projects>();
            for (const pr of projects) {
              foundProjectIds.add(pr.id);
              const propId = pr.property_id;
              if (!projectsByProperty.has(propId)) {
                projectsByProperty.set(propId, []);
              }
              projectsByProperty.get(propId)!.push(pr);
            }
            
            for (const [propId, propProjects] of projectsByProperty) {
              const propName = propertyNameMap.get(propId) || 'Okänd fastighet';
              let projInfo = `📋 PROJEKT FÖR ${propName.toUpperCase()} (${timeFilter.quarter ? 'Q' + timeFilter.quarter : ''} ${timeFilter.year || ''}):`;
              
              for (const pr of propProjects) {
                projInfo += `\n\n  ${pr.name} (${pr.project_number})`;
                projInfo += `\n    Status: ${pr.status || 'Ej angivet'}`;
                projInfo += `, Typ: ${pr.type || 'Ej angivet'}`;
                if (pr.budget) projInfo += `\n    Budget: ${pr.budget.toLocaleString('sv-SE')} kr`;
                if (pr.actual_cost) projInfo += `, Utfall: ${pr.actual_cost.toLocaleString('sv-SE')} kr`;
                if (pr.forecast) projInfo += `, Prognos: ${pr.forecast.toLocaleString('sv-SE')} kr`;
                if (pr.start_date) projInfo += `\n    Start: ${pr.start_date}`;
                if (pr.end_date) projInfo += `, Slut: ${pr.end_date}`;
                if (pr.project_manager) projInfo += `\n    Projektledare: ${pr.project_manager}`;
                if (pr.description) projInfo += `\n    Beskrivning: ${pr.description}`;
              }
              
              contextParts.push(projInfo);
            }
          }
        }
        
        // ============================================
        // SEARCH 4: Drift Tasks by Quarter/Year
        // ============================================
        if ((timeFilter.quarter || timeFilter.year) && orgPropertyIds.length > 0) {
          console.log('Searching drift tasks by time filter:', timeFilter);
          
          let query = supabase
            .from('drift_tasks')
            .select('*, property:properties(name), category:drift_categories(name)')
            .in('property_id', orgPropertyIds);
          
          if (timeFilter.quarter) {
            query = query.eq('quarter', timeFilter.quarter);
          }
          if (timeFilter.year) {
            query = query.eq('year', timeFilter.year);
          }
          
          const { data: tasks, error: tasksError } = await query.limit(100);
          
          if (tasksError) {
            console.error('Drift task time search error:', tasksError);
          } else if (tasks && tasks.length > 0) {
            console.log(`Found ${tasks.length} drift tasks for time filter`);
            
            const tasksByProperty = new Map<string, typeof tasks>();
            for (const task of tasks) {
              const propId = task.property_id;
              if (!tasksByProperty.has(propId)) {
                tasksByProperty.set(propId, []);
              }
              tasksByProperty.get(propId)!.push(task);
            }
            
            for (const [propId, propTasks] of tasksByProperty) {
              const propName = propertyNameMap.get(propId) || 'Okänd fastighet';
              let taskInfo = `📊 DRIFTUPPGIFTER FÖR ${propName.toUpperCase()} (${timeFilter.quarter ? 'Q' + timeFilter.quarter : ''} ${timeFilter.year || ''}):`;
              
              const completed = propTasks.filter(t => (t.reported_count || 0) >= (t.planned_count || 0));
              const missing = propTasks.filter(t => (t.reported_count || 0) === 0);
              const remaining = propTasks.filter(t => (t.reported_count || 0) > 0 && (t.reported_count || 0) < (t.planned_count || 0));
              
              taskInfo += `\n  Totalt: ${propTasks.length} uppgifter`;
              taskInfo += `\n  ✅ Klara: ${completed.length}`;
              taskInfo += `\n  ⏳ Delvis: ${remaining.length}`;
              taskInfo += `\n  ❌ Ej utförda: ${missing.length}`;
              
              if (missing.length > 0 && missing.length <= 10) {
                taskInfo += `\n\n  Ej utförda uppgifter:`;
                for (const task of missing) {
                  taskInfo += `\n    - ${task.name}${task.category?.name ? ` (${task.category.name})` : ''}`;
                }
              }
              
              contextParts.push(taskInfo);
            }
          }
        }
        
        // ============================================
        // SEARCH 5: Property Contacts
        // ============================================
        if (searchTerms.some(t => ['kontakt', 'kontakter', 'telefon', 'email', 'ansvarig', 'leverantör', 'entreprenör', 'firma', 'ring', 'nå', 'person'].includes(t.toLowerCase())) && orgPropertyIds.length > 0) {
          const { data: contacts, error: contactsError } = await supabase
            .from('property_contacts')
            .select('*, property:properties(name)')
            .in('property_id', orgPropertyIds)
            .limit(50);
          
          if (!contactsError && contacts && contacts.length > 0) {
            console.log(`Found ${contacts.length} contacts`);
            
            const contactsByProperty = new Map<string, typeof contacts>();
            for (const contact of contacts) {
              const propId = contact.property_id;
              if (!contactsByProperty.has(propId)) {
                contactsByProperty.set(propId, []);
              }
              contactsByProperty.get(propId)!.push(contact);
            }
            
            for (const [propId, propContacts] of contactsByProperty) {
              const propName = propertyNameMap.get(propId) || 'Okänd fastighet';
              let contactInfo = `👤 KONTAKTER FÖR ${propName.toUpperCase()}:`;
              
              for (const c of propContacts) {
                contactInfo += `\n\n  ${c.name}`;
                if (c.role) contactInfo += ` - ${c.role}`;
                if (c.company) contactInfo += ` (${c.company})`;
                if (c.phone) contactInfo += `\n    📞 ${c.phone}`;
                if (c.email) contactInfo += `\n    ✉️ ${c.email}`;
              }
              
              contextParts.push(contactInfo);
            }
          }
        }
        
        // ============================================
        // SEARCH 6: Recurring Costs
        // ============================================
        if (searchTerms.some(t => ['kostnad', 'kostnader', 'löpande', 'månadsvis', 'avtalet', 'avtal', 'faktura', 'budget', 'pris', 'betala', 'hyra', 'el', 'vatten', 'värme', 'försäkring', 'driftskostnad'].includes(t.toLowerCase())) && orgPropertyIds.length > 0) {
          const { data: recurringCosts, error: rcError } = await supabase
            .from('recurring_costs')
            .select('*, property:properties(name), account_code:account_codes(code, name)')
            .in('property_id', orgPropertyIds)
            .limit(50);
          
          if (!rcError && recurringCosts && recurringCosts.length > 0) {
            console.log(`Found ${recurringCosts.length} recurring costs`);
            
            const costsByProperty = new Map<string, typeof recurringCosts>();
            for (const cost of recurringCosts) {
              const propId = cost.property_id;
              if (!costsByProperty.has(propId)) {
                costsByProperty.set(propId, []);
              }
              costsByProperty.get(propId)!.push(cost);
            }
            
            for (const [propId, propCosts] of costsByProperty) {
              const propName = propertyNameMap.get(propId) || 'Okänd fastighet';
              let costInfo = `💰 LÖPANDE KOSTNADER FÖR ${propName.toUpperCase()}:`;
              
              let totalMonthly = 0;
              for (const c of propCosts) {
                costInfo += `\n\n  ${c.description}`;
                if (c.contractor_name) costInfo += ` (${c.contractor_name})`;
                costInfo += `\n    Belopp: ${c.amount?.toLocaleString('sv-SE')} kr`;
                costInfo += ` / ${c.payment_interval || 'månad'}`;
                if (c.account_code) {
                  costInfo += `\n    Konto: ${c.account_code.code} - ${c.account_code.name}`;
                }
                
                // Calculate monthly equivalent
                const interval = c.payment_interval || 'monthly';
                if (interval === 'monthly') totalMonthly += c.amount || 0;
                else if (interval === 'quarterly') totalMonthly += (c.amount || 0) / 3;
                else if (interval === 'yearly') totalMonthly += (c.amount || 0) / 12;
              }
              
              costInfo += `\n\n  TOTALT: ~${Math.round(totalMonthly).toLocaleString('sv-SE')} kr/mån`;
              contextParts.push(costInfo);
            }
          }
        }
        
        // ============================================
        // SEARCH 7: Property Notes
        // ============================================
        if (searchTerms.some(t => ['anteckning', 'anteckningar', 'notering', 'noteringar', 'kommentar', 'kommentarer', 'info', 'historik'].includes(t.toLowerCase())) && orgPropertyIds.length > 0) {
          const { data: notes, error: notesError } = await supabase
            .from('property_notes')
            .select('*, property:properties(name)')
            .in('property_id', orgPropertyIds)
            .order('created_at', { ascending: false })
            .limit(30);
          
          if (!notesError && notes && notes.length > 0) {
            console.log(`Found ${notes.length} property notes`);
            
            const notesByProperty = new Map<string, typeof notes>();
            for (const note of notes) {
              const propId = note.property_id;
              if (!notesByProperty.has(propId)) {
                notesByProperty.set(propId, []);
              }
              notesByProperty.get(propId)!.push(note);
            }
            
            for (const [propId, propNotes] of notesByProperty) {
              const propName = propertyNameMap.get(propId) || 'Okänd fastighet';
              let noteInfo = `📝 ANTECKNINGAR FÖR ${propName.toUpperCase()}:`;
              
              for (const n of propNotes) {
                noteInfo += `\n\n  ${n.created_at?.split('T')[0] || 'Okänt datum'}:`;
                noteInfo += `\n    ${n.content}`;
              }
              
              contextParts.push(noteInfo);
            }
          }
        }
        
        // ============================================
        // SEARCH 8: Todos
        // ============================================
        if (searchTerms.some(t => ['todo', 'todos', 'göra', 'uppgift', 'uppgifter', 'checklist', 'påminnelse', 'deadline', 'förfaller', 'planerat', 'agenda'].includes(t.toLowerCase())) && orgPropertyIds.length > 0) {
          const { data: todos, error: todosError } = await supabase
            .from('property_todos')
            .select('*, property:properties(name)')
            .in('property_id', orgPropertyIds)
            .eq('completed', false)
            .order('due_date', { ascending: true })
            .limit(30);
          
          if (!todosError && todos && todos.length > 0) {
            console.log(`Found ${todos.length} todos`);
            
            const todosByProperty = new Map<string, typeof todos>();
            for (const todo of todos) {
              const propId = todo.property_id;
              if (propId) {
                if (!todosByProperty.has(propId)) {
                  todosByProperty.set(propId, []);
                }
                todosByProperty.get(propId)!.push(todo);
              }
            }
            
            for (const [propId, propTodos] of todosByProperty) {
              const propName = propertyNameMap.get(propId) || 'Okänd fastighet';
              let todoInfo = `✅ ATT GÖRA FÖR ${propName.toUpperCase()}:`;
              
              for (const t of propTodos) {
                todoInfo += `\n\n  ${t.title}`;
                if (t.priority) todoInfo += ` [${t.priority}]`;
                if (t.due_date) todoInfo += `\n    Deadline: ${t.due_date}`;
                if (t.category) todoInfo += `\n    Kategori: ${t.category}`;
                if (t.notes) todoInfo += `\n    Notering: ${t.notes}`;
              }
              
              contextParts.push(todoInfo);
            }
          }
        }
        
        // ============================================
        // SEARCH 9: Text Search for Properties
        // ============================================
        if (searchTerms.length > 0) {
          for (const term of searchTerms.slice(0, 3)) {
            const { data: properties } = await supabase
              .from('properties')
              .select('id, name, address, property_number')
              .eq('organization_id', verifiedOrgId)
              .or(`name.ilike.%${term}%,address.ilike.%${term}%,property_number.ilike.%${term}%`)
              .limit(5);
            
            if (properties && properties.length > 0) {
              for (const prop of properties) {
                if (!foundPropertyIds.has(prop.id)) {
                  foundPropertyIds.add(prop.id);
                  contextParts.push(`🏢 FASTIGHET: ${prop.name}${prop.address ? `, ${prop.address}` : ''}${prop.property_number ? ` (${prop.property_number})` : ''}`);
                }
              }
            }
          }
        }
        
        // ============================================
        // ALWAYS: Recent activity summary (no keywords needed)
        // ============================================
        if (orgPropertyIds.length > 0) {
          // Recent work orders (last 30 days)
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const { data: recentWOs } = await supabase
            .from('work_orders')
            .select('id, action, status, priority, created_at, due_date, property:properties(name)')
            .in('property_id', orgPropertyIds)
            .gte('created_at', thirtyDaysAgo)
            .order('created_at', { ascending: false })
            .limit(10);
          
          if (recentWOs && recentWOs.length > 0) {
            const newWOs = recentWOs.filter(wo => !foundWorkOrderIds.has(wo.id));
            if (newWOs.length > 0) {
              let recentInfo = `📋 SENASTE ARBETSORDRAR (30 dagar):`;
              for (const wo of newWOs) {
                recentInfo += `\n  - ${wo.action} (${wo.property?.name || '?'}) — ${wo.status}${wo.priority ? `, prio: ${wo.priority}` : ''}`;
              }
              contextParts.push(recentInfo);
            }
          }
          
          // Upcoming todos
          const { data: upcomingTodos } = await supabase
            .from('property_todos')
            .select('id, title, due_date, priority, completed, property:properties(name)')
            .in('property_id', orgPropertyIds)
            .eq('completed', false)
            .order('due_date', { ascending: true })
            .limit(10);
          
          if (upcomingTodos && upcomingTodos.length > 0) {
            let todoInfo = `⏰ KOMMANDE ATT-GÖRA (ej avklarade):`;
            for (const t of upcomingTodos) {
              todoInfo += `\n  - ${t.title} (${t.property?.name || '?'})`;
              if (t.due_date) todoInfo += ` — deadline: ${t.due_date}`;
              if (t.priority) todoInfo += ` [${t.priority}]`;
            }
            contextParts.push(todoInfo);
          }
          
          // Active projects
          const { data: activeProjects } = await supabase
            .from('projects')
            .select('id, name, status, budget, actual_cost, start_date, end_date, property:properties(name)')
            .in('property_id', orgPropertyIds)
            .in('status', ['pagaende', 'planerat'])
            .limit(10);
          
          if (activeProjects && activeProjects.length > 0) {
            const newProjects = activeProjects.filter(p => !foundProjectIds.has(p.id));
            if (newProjects.length > 0) {
              let projInfo = `🚧 AKTIVA/PLANERADE PROJEKT:`;
              for (const p of newProjects) {
                projInfo += `\n  - ${p.name} (${p.property?.name || '?'}) — ${p.status}`;
                if (p.budget) projInfo += `, budget: ${p.budget.toLocaleString('sv-SE')} kr`;
                if (p.actual_cost) projInfo += `, utfall: ${p.actual_cost.toLocaleString('sv-SE')} kr`;
              }
              contextParts.push(projInfo);
            }
          }
        }

        // Combine context
        if (contextParts.length > 0) {
          contextInfo = `\n\n--- RELEVANT DATA FRÅN SYSTEMET ---\n${contextParts.join('\n\n')}\n--- SLUT PÅ DATA ---`;
          console.log(`Context built with ${contextParts.length} sections`);
        }
        
      } catch (searchError) {
        console.error('Error building context:', searchError);
      }
    }

    // Define tools for AI action suggestions
    const actionTools = [
      {
        type: "function",
        function: {
          name: "suggest_work_order",
          description: "Föreslå att skapa en arbetsorder baserat på konversationen. Använd detta när användaren beskriver ett problem som behöver åtgärdas.",
          parameters: {
            type: "object",
            properties: {
              action: { type: "string", description: "Beskrivning av åtgärden som ska utföras" },
              property_name: { type: "string", description: "Fastighetens namn om det nämns" },
              priority: { type: "string", enum: ["low", "medium", "high"], description: "Prioritet baserat på problembeskrivningen" },
              reasoning: { type: "string", description: "Kort förklaring på svenska varför denna åtgärd rekommenderas" },
              confidence: { type: "number", description: "Säkerhet 0.0-1.0 på att detta är rätt åtgärd" }
            },
            required: ["action", "reasoning", "confidence"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "suggest_todo",
          description: "Föreslå att skapa en att-göra-uppgift. Använd detta för uppföljningar eller uppgifter som inte är reparationer.",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Titel på uppgiften" },
              description: { type: "string", description: "Beskrivning av uppgiften" },
              property_name: { type: "string", description: "Fastighetens namn om det nämns" },
              due_date: { type: "string", description: "Föreslagen deadline i format YYYY-MM-DD" },
              priority: { type: "string", enum: ["low", "medium", "high"] },
              reasoning: { type: "string", description: "Varför denna uppgift bör skapas" },
              confidence: { type: "number", description: "Säkerhet 0.0-1.0" }
            },
            required: ["title", "reasoning", "confidence"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "suggest_maintenance",
          description: "Föreslå att schemalägga underhåll för en komponent. Använd vid diskussion om förebyggande underhåll.",
          parameters: {
            type: "object",
            properties: {
              component_name: { type: "string", description: "Komponentens namn" },
              maintenance_type: { type: "string", description: "Typ av underhåll" },
              suggested_date: { type: "string", description: "Föreslagen datum i format YYYY-MM-DD" },
              reasoning: { type: "string", description: "Varför detta underhåll behövs" },
              confidence: { type: "number", description: "Säkerhet 0.0-1.0" }
            },
            required: ["maintenance_type", "reasoning", "confidence"]
          }
        }
      }
    ];

    // Build system prompt with action instructions
    const systemPrompt = `Du är en expert AI-assistent för fastighetsförvaltning. Du har tillgång till organisationens alla data: fastigheter, komponenter, underhållshistorik, arbetsordrar, projekt, driftuppgifter, kontakter, löpande kostnader, anteckningar och att-göra-listor.

VIKTIGA REGLER:
1. Svara ALLTID på svenska
2. Var KONKRET och SPECIFIK — referera alltid till faktisk data, namn, siffror och datum
3. Om du har data, presentera den strukturerat med siffror och detaljer. Generiska svar utan datagrund är oacceptabla.
4. Om serviceprotokoll finns, lyft fram mätvärden, avvikelser och rekommendationer
5. Skillnad mellan DRIFTUPPGIFTER (kvartalsvis återkommande underhåll, räknas i antal) och ATT GÖRA (todos med deadline)
6. Om information saknas i den medföljande datan, säg EXAKT vilken data som saknas och föreslå hur användaren kan komplettera
7. Vid frågor om översikter/status — ge alltid siffror (antal, kronor, procent)
8. Jämför gärna mot tidsperioder eller andra fastigheter om data finns

DATAKVALITET:
- Under "ORGANISATIONSÖVERSIKT" ser du alla fastigheter och komponenter i systemet
- Under "SEMANTISK SÖKNING" visas data som bäst matchar användarens fråga
- Under specifika sökningar (UNDERHÅLL, ARBETSORDRAR, etc.) finns detaljerad data
- Använd ALLTID denna data som grund — gissa aldrig

ÅTGÄRDSFÖRSLAG:
Använd verktygen för att föreslå åtgärder:
- suggest_work_order: Reparationer eller underhåll som behövs
- suggest_maintenance: Komponent som behöver service
- suggest_todo: Uppgifter att följa upp

Var PROAKTIV men kräv minst 70% säkerhet (confidence >= 0.7).

SVARSFORMAT för servicerapporter:
📊 SAMMANFATTNING — Översikt av utfört arbete
🔍 MÄTVÄRDEN — Specifika mätvärden från protokoll
⚠️ AVVIKELSER & REKOMMENDATIONER — Problem och åtgärdsförslag

${contextInfo}`;

    // Decide whether to use tools (not compatible with streaming)
    const useTools = !streamRequested;

    // Make AI request with retry logic
    const makeAIRequest = async () => {
      const requestBody: any = {
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        stream: streamRequested || false,
      };

      // Add tools only for non-streaming requests
      if (useTools) {
        requestBody.tools = actionTools;
        requestBody.tool_choice = "auto";
      }

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
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

      return response;
    };

    // Execute with retry
    const response = await withRetry(makeAIRequest);

    // Handle streaming response
    if (streamRequested && response.body) {
      recordSuccess();
      return new Response(response.body, {
        headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
      });
    }

    // Handle regular response with potential tool calls
    const data = await response.json();
    console.log('AI response received');
    recordSuccess();
    
    const choice = data.choices?.[0];
    const message = choice?.message?.content || '';
    const toolCalls = choice?.message?.tool_calls || [];

    // Process tool calls and save suggested actions
    const suggestedActions: any[] = [];
    
    if (toolCalls.length > 0 && conversationId) {
      console.log(`Processing ${toolCalls.length} tool calls`);
      
      for (const toolCall of toolCalls) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          
          // Map tool name to action type
          const actionTypeMap: Record<string, string> = {
            'suggest_work_order': 'create_work_order',
            'suggest_todo': 'create_todo',
            'suggest_maintenance': 'schedule_maintenance'
          };
          
          const actionType = actionTypeMap[toolCall.function.name] || toolCall.function.name;
          
          // Only save high-confidence suggestions
          if (args.confidence >= 0.5) {
            const { data: insertedAction, error: insertError } = await supabase
              .from('ai_suggested_actions')
              .insert({
                organization_id: verifiedOrgId,
                conversation_id: conversationId,
                action_type: actionType,
                payload: {
                  action: args.action,
                  title: args.title,
                  description: args.description,
                  property_name: args.property_name,
                  component_name: args.component_name,
                  priority: args.priority,
                  due_date: args.due_date,
                  suggested_date: args.suggested_date,
                  maintenance_type: args.maintenance_type
                },
                confidence_score: args.confidence,
                reasoning: args.reasoning
              })
              .select()
              .single();
            
            if (insertError) {
              console.error('Error saving action:', insertError);
            } else if (insertedAction) {
              suggestedActions.push({
                id: insertedAction.id,
                type: actionType,
                ...args
              });
              console.log('Saved suggested action:', insertedAction.id);
            }
          }
        } catch (parseError) {
          console.error('Error parsing tool call:', parseError);
        }
      }
    }

    return new Response(JSON.stringify({ 
      message: message || 'Jag förstår. Finns det något mer jag kan hjälpa till med?',
      suggestedActions 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    console.error('Error in ai-chat function:', error);
    recordFailure();
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check if it's a circuit breaker error
    if (errorMessage.includes('tillfälligt otillgänglig')) {
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Extract meaningful search terms from user message
function extractSearchTerms(message: string): string[] {
  const stopWords = [
    'berätta', 'om', 'vad', 'är', 'hur', 'kan', 'du', 'jag', 'vi', 'det', 'den', 'de',
    'ett', 'en', 'och', 'eller', 'för', 'med', 'på', 'i', 'av', 'till', 'från',
    'finns', 'har', 'hade', 'vara', 'bli', 'får', 'ska', 'vill', 'måste',
    'visa', 'ge', 'mig', 'information', 'data', 'uppgifter', 'detaljer',
    'alla', 'allt', 'vilka', 'vilken', 'vilket', 'denna', 'detta', 'dessa',
    'min', 'mitt', 'mina', 'din', 'ditt', 'dina', 'sin', 'sitt', 'sina',
    'vår', 'vårt', 'våra', 'er', 'ert', 'era', 'deras',
    'när', 'var', 'vart', 'varför', 'hur', 'mycket'
  ];
  
  const words = message
    .toLowerCase()
    .replace(/[.,!?;:'"()[\]{}]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1 && !stopWords.includes(word));
  
  const propertyNameMatch = message.match(/([A-ZÅÄÖ][a-zåäö]+\s*\d+)/gi);
  if (propertyNameMatch) {
    words.push(...propertyNameMatch.map(m => m.trim()));
  }
  
  const quotedMatch = message.match(/"([^"]+)"/g);
  if (quotedMatch) {
    words.push(...quotedMatch.map(m => m.replace(/"/g, '').trim()));
  }
  
  const yearPattern = /^20[2-3]\d$/;
  return [...new Set(words)].filter(w => !yearPattern.test(w));
}

interface TimeFilter {
  quarter?: number;
  year?: number;
}

function parseTimeFilter(message: string): TimeFilter {
  const filter: TimeFilter = {};
  
  const quarterMatch = message.match(/(?:q|kvartal\s*)([1-4])/i);
  if (quarterMatch) {
    filter.quarter = parseInt(quarterMatch[1]);
  }
  
  const yearMatch = message.match(/\b(20[2-3]\d)\b/);
  if (yearMatch) {
    filter.year = parseInt(yearMatch[1]);
  }
  
  return filter;
}
