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
        
        // Get all properties and components for user's organization
        const { data: orgProperties } = await supabase
          .from('properties')
          .select('id, name')
          .eq('organization_id', verifiedOrgId);
        const orgPropertyIds = orgProperties?.map(p => p.id) || [];
        const propertyNameMap = new Map(orgProperties?.map(p => [p.id, p.name]) || []);
        
        // Get all component IDs for the organization's properties
        const { data: orgComponents } = await supabase
          .from('components')
          .select('id, name, property_id')
          .in('property_id', orgPropertyIds);
        const orgComponentIds = orgComponents?.map(c => c.id) || [];
        const componentNameMap = new Map(orgComponents?.map(c => [c.id, c.name]) || []);
        const componentPropertyMap = new Map(orgComponents?.map(c => [c.id, c.property_id]) || []);
        
        // ============================================
        // SEARCH 1: Maintenance History by Year/Terms
        // ============================================
        // This catches questions like "when did we replace the roof in 2025" or "what did ventilation cost"
        if (orgComponentIds.length > 0) {
          let maintenanceQuery = supabase
            .from('maintenance_history')
            .select('*, component:components(name, property_id, property:properties(name)), documents:maintenance_history_documents(id, file_name, file_url)')
            .in('component_id', orgComponentIds)
            .order('performed_date', { ascending: false });
          
          // Filter by year if specified
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
            
            // Collect all document IDs to fetch their embeddings
            const allDocIds = maintenanceRecords.flatMap(mh => 
              (mh.documents || []).map((d: any) => d.id)
            ).filter(Boolean);
            
            // Fetch document embeddings for PDF content
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
            
            // Filter by search terms if present
            let filteredRecords = maintenanceRecords;
            if (searchTerms.length > 0) {
              filteredRecords = maintenanceRecords.filter(mh => {
                const searchText = `${mh.action_type || ''} ${mh.notes || ''} ${mh.category || ''} ${mh.supplier || ''} ${mh.component?.name || ''}`.toLowerCase();
                return searchTerms.some(term => searchText.includes(term.toLowerCase()));
              });
            }
            
            if (filteredRecords.length > 0 || timeFilter.year) {
              // Group by property for presentation
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
                  
                  // Add document information with content from embeddings
                  if (mh.documents && mh.documents.length > 0) {
                    mhInfo += `\n    📄 Bifogade dokument:`;
                    for (const doc of mh.documents) {
                      mhInfo += `\n      - ${doc.file_name}`;
                      
                      // Find and include parsed document content from embeddings
                      const docEmbedding = docEmbeddings.find(e => e.source_id === doc.id);
                      if (docEmbedding?.content) {
                        // Extract the document content section
                        const contentMatch = docEmbedding.content.match(/DOKUMENTINNEHÅLL:\s*([\s\S]+)/i);
                        if (contentMatch && contentMatch[1]) {
                          const docContent = contentMatch[1].trim().substring(0, 2000);
                          mhInfo += `\n        📋 PROTOKOLLINNEHÅLL:\n        ${docContent.replace(/\n/g, '\n        ')}`;
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
          
          // Filter by year if specified (use due_date or created_at)
          if (timeFilter.year) {
            const yearStart = `${timeFilter.year}-01-01`;
            const yearEnd = `${timeFilter.year}-12-31`;
            workOrderQuery = workOrderQuery.or(`due_date.gte.${yearStart},created_at.gte.${yearStart}`);
          }
          
          const { data: workOrders, error: woError } = await workOrderQuery.limit(50);
          
          if (woError) {
            console.error('Work order year search error:', woError);
          } else if (workOrders && workOrders.length > 0) {
            // Filter by search terms if present
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
              
              // Group by property
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
            
            // Group by property for better presentation
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
                
                // Checklist summary
                if (pr.project_checklist_items && pr.project_checklist_items.length > 0) {
                  const completed = pr.project_checklist_items.filter((i: any) => i.completed).length;
                  projInfo += `\n    Checklista: ${completed}/${pr.project_checklist_items.length} klara`;
                }
                
                // Costs summary
                if (pr.project_cost_items && pr.project_cost_items.length > 0) {
                  const totalCost = pr.project_cost_items.reduce((sum: number, c: any) => sum + (c.amount || 0), 0);
                  projInfo += `\n    Bokförda kostnader: ${totalCost.toLocaleString('sv-SE')} kr`;
                }
              }
              
              contextParts.push(projInfo);
            }
            
            // Add summary
            const totalBudget = projects.reduce((sum, p) => sum + (p.budget || 0), 0);
            const totalActual = projects.reduce((sum, p) => sum + (p.actual_cost || 0), 0);
            const totalForecast = projects.reduce((sum, p) => sum + (p.forecast || 0), 0);
            
            contextParts.unshift(`📊 SAMMANFATTNING ${timeFilter.quarter ? 'Q' + timeFilter.quarter : ''} ${timeFilter.year || ''}:
  Antal projekt: ${projects.length}
  Total budget: ${totalBudget.toLocaleString('sv-SE')} kr
  Totalt utfall: ${totalActual.toLocaleString('sv-SE')} kr
  Total prognos: ${totalForecast.toLocaleString('sv-SE')} kr
  Fastigheter: ${projectsByProperty.size} st`);
          }
          
          // Also search drift tasks for the same time period
          const quarterName = timeFilter.quarter ? `Q${timeFilter.quarter}` : null;
          if (quarterName || timeFilter.year) {
            let driftQuery = supabase
              .from('drift_tasks')
              .select('*, property:properties(name), drift_task_components(*)')
              .in('property_id', orgPropertyIds);
            
            if (quarterName) {
              driftQuery = driftQuery.eq('quarter', quarterName);
            }
            if (timeFilter.year) {
              driftQuery = driftQuery.eq('year', timeFilter.year);
            }
            
            const { data: driftTasks } = await driftQuery.limit(30);
            
            if (driftTasks && driftTasks.length > 0) {
              console.log(`Found ${driftTasks.length} drift tasks for time filter`);
              
              // Group by property
              const tasksByProperty = new Map<string, typeof driftTasks>();
              for (const dt of driftTasks) {
                const propId = dt.property_id;
                if (!tasksByProperty.has(propId)) {
                  tasksByProperty.set(propId, []);
                }
                tasksByProperty.get(propId)!.push(dt);
              }
              
              for (const [propId, propTasks] of tasksByProperty) {
                const propName = propertyNameMap.get(propId) || 'Okänd fastighet';
                let taskInfo = `🔄 DRIFTUPPGIFTER FÖR ${propName.toUpperCase()} (${quarterName || ''} ${timeFilter.year || ''}):`;
                
                for (const dt of propTasks) {
                  taskInfo += `\n  ${dt.name}`;
                  taskInfo += ` - Planerat: ${dt.planned_count}, Rapporterat: ${dt.reported_count}`;
                  if (dt.description) taskInfo += `\n    ${dt.description}`;
                }
                
                contextParts.push(taskInfo);
              }
            }
          }
        }
        
        // ============================================
        // SEARCH 4: Properties by search terms
        // ============================================
        for (const term of searchTerms) {
          const { data: properties } = await supabase
            .from('properties')
            .select('*')
            .eq('organization_id', verifiedOrgId)
            .or(`name.ilike.%${term}%,address.ilike.%${term}%,property_number.ilike.%${term}%,loa.ilike.%${term}%`)
            .limit(5);
          
          if (properties && properties.length > 0) {
            for (const p of properties) {
              if (foundPropertyIds.has(p.id)) continue;
              foundPropertyIds.add(p.id);
              
              // Fetch ALL related data for this property in parallel
              const [
                componentsResult,
                projectsResult,
                todosResult,
                notesResult,
                contactsResult,
                recurringCostsResult,
                documentsResult,
                floorsResult,
                driftTasksResult,
                driftCategoriesResult,
                energyHistoryResult,
                workOrdersResult
              ] = await Promise.all([
                supabase.from('components').select('*, maintenance_history(*)').eq('property_id', p.id).limit(20),
                supabase.from('projects').select('*, project_cost_items(*), project_checklist_items(*), project_notes(*)').eq('property_id', p.id).limit(10),
                supabase.from('property_todos').select('*').eq('property_id', p.id).limit(20),
                supabase.from('property_notes').select('*').eq('property_id', p.id).limit(10),
                supabase.from('property_contacts').select('*').eq('property_id', p.id).limit(20),
                supabase.from('property_recurring_costs').select('*, account_codes(code, description)').eq('property_id', p.id).limit(20),
                supabase.from('property_documents').select('*').eq('property_id', p.id).limit(20),
                supabase.from('floors').select('*').eq('property_id', p.id).limit(10),
                supabase.from('drift_tasks').select('*, drift_task_components(*)').eq('property_id', p.id).limit(20),
                supabase.from('drift_categories').select('*').eq('property_id', p.id).limit(20),
                supabase.from('property_energy_history').select('*').eq('property_id', p.id).order('recorded_at', { ascending: false }).limit(5),
                supabase.from('work_orders').select('*').eq('property_id', p.id).limit(20)
              ]);
              
              let propInfo = `📍 FASTIGHET: ${p.name}
- Fastighetsnummer: ${p.property_number || 'Ej angivet'}
- Adress: ${p.address || 'Ej angivet'}
- Fakturaadress: ${p.invoice_address || 'Ej angivet'}
- Typ: ${p.property_type || 'Ej angivet'}
- Byggår: ${p.construction_year || 'Ej angivet'}
- LOA: ${p.loa ? p.loa + ' m²' : 'Ej angivet'}
- Area: ${p.area_sqm ? p.area_sqm + ' m²' : 'Ej angivet'}
- Beskrivning: ${p.description || 'Ingen beskrivning'}`;

              // Floors
              if (floorsResult.data && floorsResult.data.length > 0) {
                propInfo += `\n\n🏢 VÅNINGSPLAN (${floorsResult.data.length} st):`;
                for (const f of floorsResult.data) {
                  propInfo += `\n  - ${f.name}${f.level !== null ? ` (Nivå ${f.level})` : ''}`;
                }
              }

              // Components with maintenance history
              if (componentsResult.data && componentsResult.data.length > 0) {
                propInfo += `\n\n🔧 KOMPONENTER (${componentsResult.data.length} st):`;
                for (const c of componentsResult.data) {
                  foundComponentIds.add(c.id);
                  propInfo += `\n  - ${c.name}`;
                  propInfo += `\n    Typ: ${c.type || 'okänd'}, Status: ${c.status || 'okänd'}`;
                  if (c.manufacturer) propInfo += `, Tillverkare: ${c.manufacturer}`;
                  if (c.model) propInfo += `, Modell: ${c.model}`;
                  if (c.serial_number) propInfo += `, Serienr: ${c.serial_number}`;
                  if (c.installation_year) propInfo += `, Installationsår: ${c.installation_year}`;
                  if (c.next_service_date) propInfo += `, Nästa service: ${c.next_service_date}`;
                  if (c.room_zone) propInfo += `, Rum/Zon: ${c.room_zone}`;
                  if (c.notes) propInfo += `\n    Anteckningar: ${c.notes}`;
                  
                  // Maintenance history
                  if (c.maintenance_history && c.maintenance_history.length > 0) {
                    propInfo += `\n    Underhållshistorik:`;
                    for (const mh of c.maintenance_history.slice(0, 5)) {
                      foundMaintenanceIds.add(mh.id);
                      propInfo += `\n      - ${mh.performed_date}: ${mh.action_type}${mh.cost ? ` (${mh.cost.toLocaleString('sv-SE')} kr)` : ''}${mh.supplier ? ` - ${mh.supplier}` : ''}${mh.notes ? ` - ${mh.notes}` : ''}`;
                    }
                  }
                }
              }
              
              // Projects with costs and checklists
              if (projectsResult.data && projectsResult.data.length > 0) {
                propInfo += `\n\n📋 PROJEKT (${projectsResult.data.length} st):`;
                for (const pr of projectsResult.data) {
                  propInfo += `\n  - ${pr.name} (${pr.project_number})`;
                  propInfo += `\n    Typ: ${pr.type || 'okänd'}, Status: ${pr.status || 'okänd'}`;
                  if (pr.budget) propInfo += `, Budget: ${pr.budget.toLocaleString('sv-SE')} kr`;
                  if (pr.actual_cost) propInfo += `, Utfall: ${pr.actual_cost.toLocaleString('sv-SE')} kr`;
                  if (pr.forecast) propInfo += `, Prognos: ${pr.forecast.toLocaleString('sv-SE')} kr`;
                  if (pr.start_date) propInfo += `\n    Start: ${pr.start_date}`;
                  if (pr.end_date) propInfo += `, Slut: ${pr.end_date}`;
                  if (pr.project_manager) propInfo += `\n    Projektledare: ${pr.project_manager}`;
                  if (pr.description) propInfo += `\n    Beskrivning: ${pr.description}`;
                  
                  // Project costs
                  if (pr.project_cost_items && pr.project_cost_items.length > 0) {
                    const totalCost = pr.project_cost_items.reduce((sum: number, c: any) => sum + (c.amount || 0), 0);
                    propInfo += `\n    Kostnader (${pr.project_cost_items.length} poster, totalt ${totalCost.toLocaleString('sv-SE')} kr)`;
                  }
                  
                  // Checklist items
                  if (pr.project_checklist_items && pr.project_checklist_items.length > 0) {
                    const completed = pr.project_checklist_items.filter((i: any) => i.completed).length;
                    propInfo += `\n    Checklista: ${completed}/${pr.project_checklist_items.length} klara`;
                  }
                }
              }
              
              // Todos
              if (todosResult.data && todosResult.data.length > 0) {
                const openTodos = todosResult.data.filter((t: any) => !t.completed);
                const completedTodos = todosResult.data.filter((t: any) => t.completed);
                propInfo += `\n\n✅ ATT GÖRA (${openTodos.length} öppna, ${completedTodos.length} avslutade):`;
                for (const t of openTodos.slice(0, 10)) {
                  propInfo += `\n  - ${t.title}`;
                  if (t.priority) propInfo += ` [${t.priority}]`;
                  if (t.category) propInfo += ` (${t.category})`;
                  if (t.due_date) propInfo += ` - Deadline: ${t.due_date}`;
                  if (t.notes) propInfo += `\n    ${t.notes}`;
                }
              }
              
              // Contacts
              if (contactsResult.data && contactsResult.data.length > 0) {
                propInfo += `\n\n👥 KONTAKTER (${contactsResult.data.length} st):`;
                for (const c of contactsResult.data) {
                  propInfo += `\n  - ${c.name}`;
                  if (c.role) propInfo += ` (${c.role})`;
                  if (c.company) propInfo += ` - ${c.company}`;
                  if (c.phone) propInfo += `, Tel: ${c.phone}`;
                  if (c.email) propInfo += `, E-post: ${c.email}`;
                }
              }
              
              // Recurring costs
              if (recurringCostsResult.data && recurringCostsResult.data.length > 0) {
                const totalAnnual = recurringCostsResult.data.reduce((sum: number, c: any) => {
                  const months = c.base_interval_months || 12;
                  return sum + ((c.amount || 0) * (12 / months));
                }, 0);
                propInfo += `\n\n💰 LÖPANDE KOSTNADER (${recurringCostsResult.data.length} st, ca ${Math.round(totalAnnual).toLocaleString('sv-SE')} kr/år):`;
                for (const rc of recurringCostsResult.data) {
                  propInfo += `\n  - ${rc.description}: ${rc.amount?.toLocaleString('sv-SE')} kr`;
                  if (rc.base_interval_months) propInfo += ` var ${rc.base_interval_months}:e månad`;
                  if (rc.contractor_name) propInfo += ` (${rc.contractor_name})`;
                  if (rc.next_due_date) propInfo += ` - Nästa: ${rc.next_due_date}`;
                  if (rc.account_codes) propInfo += ` [${rc.account_codes.code}]`;
                }
              }
              
              // Documents
              if (documentsResult.data && documentsResult.data.length > 0) {
                propInfo += `\n\n📄 DOKUMENT (${documentsResult.data.length} st):`;
                for (const d of documentsResult.data.slice(0, 10)) {
                  propInfo += `\n  - ${d.name}`;
                  if (d.mime_type) propInfo += ` (${d.mime_type})`;
                  if (d.file_size) propInfo += ` - ${Math.round(d.file_size / 1024)} KB`;
                }
              }
              
              // Notes
              if (notesResult.data && notesResult.data.length > 0) {
                propInfo += `\n\n📝 ANTECKNINGAR (${notesResult.data.length} st):`;
                for (const n of notesResult.data) {
                  propInfo += `\n  - ${n.content.slice(0, 200)}${n.content.length > 200 ? '...' : ''}`;
                }
              }
              
              // Drift tasks
              if (driftTasksResult.data && driftTasksResult.data.length > 0) {
                propInfo += `\n\n🔄 DRIFTUPPGIFTER (${driftTasksResult.data.length} st):`;
                for (const dt of driftTasksResult.data) {
                  propInfo += `\n  - ${dt.name} (${dt.quarter} ${dt.year})`;
                  propInfo += ` - Planerat: ${dt.planned_count}, Rapporterat: ${dt.reported_count}`;
                  if (dt.description) propInfo += `\n    ${dt.description}`;
                }
              }
              
              // Drift categories
              if (driftCategoriesResult.data && driftCategoriesResult.data.length > 0) {
                propInfo += `\n\n📂 DRIFTKATEGORIER: ${driftCategoriesResult.data.map((c: any) => c.name).join(', ')}`;
              }
              
              // Energy history
              if (energyHistoryResult.data && energyHistoryResult.data.length > 0) {
                propInfo += `\n\n⚡ ENERGIDEKLARATION:`;
                const latest = energyHistoryResult.data[0];
                if (latest.energy_grade) propInfo += `\n  Energiklass: ${latest.energy_grade}`;
                if (latest.primary_energy_number) propInfo += `\n  Primärenergital: ${latest.primary_energy_number} kWh/m²`;
                if (latest.specific_energy_use) propInfo += `\n  Specifik energianvändning: ${latest.specific_energy_use} kWh/m²`;
                propInfo += `\n  Datum: ${latest.recorded_at}`;
              }
              
              // Work orders
              if (workOrdersResult.data && workOrdersResult.data.length > 0) {
                const ongoingStatuses = new Set(['not_started', 'awaiting_quote', 'ordered']);
                const pending = workOrdersResult.data.filter((wo: any) => ongoingStatuses.has(wo.status));
                const completed = workOrdersResult.data.filter((wo: any) => wo.status === 'completed');

                const statusLabel = (status: string) => {
                  if (status === 'not_started') return 'Ej påbörjad';
                  if (status === 'awaiting_quote') return 'Väntar på offert';
                  if (status === 'ordered') return 'Beställd';
                  if (status === 'completed') return 'Avslutad';
                  if (status === 'archived') return 'Arkiverad';
                  return status;
                };

                propInfo += `\n\n🛠️ ARBETSORDRAR (${pending.length} pågående, ${completed.length} avslutade):`;

                // Show ongoing first
                for (const wo of pending) {
                  foundWorkOrderIds.add(wo.id);
                  propInfo += `\n  - ${wo.action}`;
                  propInfo += `\n    Status: ${statusLabel(wo.status)}`;
                  if (wo.priority) propInfo += `, Prioritet: ${wo.priority}`;
                  if (wo.contractor) propInfo += `\n    Entreprenör: ${wo.contractor}`;
                  if (wo.due_date) propInfo += `\n    Deadline: ${wo.due_date}`;
                  if (wo.quarter) propInfo += `, Kvartal: ${wo.quarter}`;
                  if (wo.price) propInfo += `\n    Pris: ${wo.price.toLocaleString('sv-SE')} kr`;
                  if (wo.comments) propInfo += `\n    Kommentar: ${wo.comments}`;
                }

                // Show recent completed
                for (const wo of completed.slice(0, 5)) {
                  foundWorkOrderIds.add(wo.id);
                  propInfo += `\n  - ${wo.action} (Avslutad)`;
                  if (wo.contractor) propInfo += ` - ${wo.contractor}`;
                  if (wo.price) propInfo += ` - ${wo.price.toLocaleString('sv-SE')} kr`;
                }
              }
              
              contextParts.push(propInfo);
            }
          }
        }
        
        // ============================================
        // SEARCH 5: Components directly by search terms
        // ============================================
        for (const term of searchTerms) {
          if (orgPropertyIds.length === 0) continue;
          
          const { data: components } = await supabase
            .from('components')
            .select('*, property:properties(name, address), maintenance_history(*), component_purchase_info(*), component_documents(*)')
            .in('property_id', orgPropertyIds)
            .or(`name.ilike.%${term}%,type.ilike.%${term}%,manufacturer.ilike.%${term}%,serial_number.ilike.%${term}%,registration_number.ilike.%${term}%,notes.ilike.%${term}%`)
            .limit(10);
          
          if (components && components.length > 0) {
            for (const c of components) {
              if (foundComponentIds.has(c.id)) continue;
              foundComponentIds.add(c.id);
              
              let compInfo = `🔧 KOMPONENT: ${c.name}
- Typ: ${c.type || 'Ej angivet'}
- Tillverkare: ${c.manufacturer || 'Ej angivet'}
- Modell: ${c.model || 'Ej angivet'}
- Serienummer: ${c.serial_number || 'Ej angivet'}
- Registreringsnummer: ${c.registration_number || 'Ej angivet'}
- Status: ${c.status || 'Ej angivet'}
- Installationsår: ${c.installation_year || 'Ej angivet'}
- Nästa service: ${c.next_service_date || 'Ej angivet'}
- Rum/Zon: ${c.room_zone || 'Ej angivet'}
- AFF-kod: ${c.aff_code || 'Ej angivet'}
- Fastighet: ${c.property?.name || 'Ej angivet'}`;
              
              if (c.notes) compInfo += `\n- Anteckningar: ${c.notes}`;
              
              // Refrigerant info
              if (c.refrigerant_type || c.refrigerant_amount_kg) {
                compInfo += `\n- Köldmedium: ${c.refrigerant_type || 'okänt'}`;
                if (c.refrigerant_amount_kg) compInfo += ` (${c.refrigerant_amount_kg} kg)`;
                if (c.refrigerant_code) compInfo += ` [${c.refrigerant_code}]`;
              }
              
              // Purchase info
              if (c.component_purchase_info) {
                const pi = c.component_purchase_info;
                if (pi.purchase_date) compInfo += `\n- Inköpsdatum: ${pi.purchase_date}`;
                if (pi.purchase_cost) compInfo += `\n- Inköpspris: ${pi.purchase_cost.toLocaleString('sv-SE')} kr`;
                if (pi.expected_lifespan_years) compInfo += `\n- Förväntad livslängd: ${pi.expected_lifespan_years} år`;
                if (pi.warranty_years) compInfo += `\n- Garanti: ${pi.warranty_years} år`;
              }
              
              // Maintenance history
              if (c.maintenance_history && c.maintenance_history.length > 0) {
                compInfo += `\n\nUnderhållshistorik (${c.maintenance_history.length} poster):`;
                for (const mh of c.maintenance_history.slice(0, 10)) {
                  foundMaintenanceIds.add(mh.id);
                  compInfo += `\n  - ${mh.performed_date}: ${mh.action_type}`;
                  if (mh.cost) compInfo += ` (${mh.cost.toLocaleString('sv-SE')} kr)`;
                  if (mh.supplier) compInfo += ` - ${mh.supplier}`;
                  if (mh.category) compInfo += ` [${mh.category}]`;
                  if (mh.notes) compInfo += ` - ${mh.notes}`;
                }
              }
              
              // Documents
              if (c.component_documents && c.component_documents.length > 0) {
                compInfo += `\n\nDokument (${c.component_documents.length} st):`;
                for (const d of c.component_documents.slice(0, 5)) {
                  compInfo += `\n  - ${d.name}`;
                }
              }
              
              contextParts.push(compInfo);
            }
          }
        }
        
        // ============================================
        // SEARCH 6: Maintenance history by action type/notes
        // ============================================
        for (const term of searchTerms) {
          if (orgComponentIds.length === 0) continue;
          
          const { data: maintenance } = await supabase
            .from('maintenance_history')
            .select('*, component:components(name, property_id, property:properties(name))')
            .in('component_id', orgComponentIds)
            .or(`action_type.ilike.%${term}%,notes.ilike.%${term}%,category.ilike.%${term}%,supplier.ilike.%${term}%`)
            .order('performed_date', { ascending: false })
            .limit(15);
          
          if (maintenance && maintenance.length > 0) {
            for (const mh of maintenance) {
              if (foundMaintenanceIds.has(mh.id)) continue;
              foundMaintenanceIds.add(mh.id);
              
              const propName = mh.component?.property?.name || 'Okänd fastighet';
              let mhInfo = `🔧 UNDERHÅLL: ${mh.action_type}
- Datum: ${mh.performed_date}
- Komponent: ${mh.component?.name || 'Okänd'}
- Fastighet: ${propName}`;
              if (mh.category) mhInfo += `\n- Kategori: ${mh.category}`;
              if (mh.cost) mhInfo += `\n- Kostnad: ${mh.cost.toLocaleString('sv-SE')} kr`;
              if (mh.expected_cost) mhInfo += `\n- Förväntad kostnad: ${mh.expected_cost.toLocaleString('sv-SE')} kr`;
              if (mh.supplier) mhInfo += `\n- Leverantör: ${mh.supplier}`;
              if (mh.is_warranty) mhInfo += `\n- Garanti: Ja`;
              if (mh.notes) mhInfo += `\n- Anteckningar: ${mh.notes}`;
              
              contextParts.push(mhInfo);
            }
          }
        }
        
        // ============================================
        // SEARCH 7: Projects directly by search terms
        // ============================================
        for (const term of searchTerms) {
          if (orgPropertyIds.length === 0) continue;
          
          const { data: projects } = await supabase
            .from('projects')
            .select('*, property:properties(name), project_cost_items(*), project_checklist_items(*), project_notes(*), project_documents(*)')
            .in('property_id', orgPropertyIds)
            .or(`name.ilike.%${term}%,project_number.ilike.%${term}%,description.ilike.%${term}%,project_manager.ilike.%${term}%`)
            .limit(5);
          
          if (projects && projects.length > 0) {
            for (const pr of projects) {
              // Skip if already found via time filter or already in context
              if (foundProjectIds.has(pr.id)) continue;
              foundProjectIds.add(pr.id);
              
              let projInfo = `📋 PROJEKT: ${pr.name}
- Projektnummer: ${pr.project_number}
- Typ: ${pr.type || 'Ej angivet'}
- Status: ${pr.status || 'Ej angivet'}
- Fastighet: ${pr.property?.name || 'Ej angivet'}`;
              
              if (pr.budget) projInfo += `\n- Budget: ${pr.budget.toLocaleString('sv-SE')} kr`;
              if (pr.actual_cost) projInfo += `\n- Utfall: ${pr.actual_cost.toLocaleString('sv-SE')} kr`;
              if (pr.forecast) projInfo += `\n- Prognos: ${pr.forecast.toLocaleString('sv-SE')} kr`;
              if (pr.start_date) projInfo += `\n- Startdatum: ${pr.start_date}`;
              if (pr.end_date) projInfo += `\n- Slutdatum: ${pr.end_date}`;
              if (pr.project_manager) projInfo += `\n- Projektledare: ${pr.project_manager}`;
              if (pr.description) projInfo += `\n- Beskrivning: ${pr.description}`;
              if (pr.actors && pr.actors.length > 0) projInfo += `\n- Aktörer: ${pr.actors.join(', ')}`;
              
              // Costs
              if (pr.project_cost_items && pr.project_cost_items.length > 0) {
                projInfo += `\n\nKostnader (${pr.project_cost_items.length} poster):`;
                const totalCost = pr.project_cost_items.reduce((sum: number, c: any) => sum + (c.amount || 0), 0);
                projInfo += `\n  Totalt: ${totalCost.toLocaleString('sv-SE')} kr`;
                for (const ci of pr.project_cost_items.slice(0, 10)) {
                  projInfo += `\n  - ${ci.description}: ${ci.amount?.toLocaleString('sv-SE')} kr (${ci.cost_date})`;
                  if (ci.actor) projInfo += ` - ${ci.actor}`;
                  if (ci.category) projInfo += ` [${ci.category}]`;
                }
              }
              
              // Checklist
              if (pr.project_checklist_items && pr.project_checklist_items.length > 0) {
                const completed = pr.project_checklist_items.filter((i: any) => i.completed).length;
                projInfo += `\n\nChecklista (${completed}/${pr.project_checklist_items.length} klara):`;
                for (const cli of pr.project_checklist_items.slice(0, 10)) {
                  projInfo += `\n  - [${cli.completed ? 'x' : ' '}] ${cli.title}`;
                  if (cli.responsible) projInfo += ` (${cli.responsible})`;
                  if (cli.deadline) projInfo += ` - ${cli.deadline}`;
                }
              }
              
              // Notes
              if (pr.project_notes && pr.project_notes.length > 0) {
                projInfo += `\n\nAnteckningar:`;
                for (const n of pr.project_notes.slice(0, 5)) {
                  projInfo += `\n  - ${n.content.slice(0, 150)}${n.content.length > 150 ? '...' : ''}`;
                }
              }
              
              contextParts.push(projInfo);
            }
          }
        }
        
        // ============================================
        // SEARCH 8: Contacts by search terms
        // ============================================
        for (const term of searchTerms) {
          if (orgPropertyIds.length === 0) continue;
          
          const { data: contacts } = await supabase
            .from('property_contacts')
            .select('*, property:properties(name)')
            .in('property_id', orgPropertyIds)
            .or(`name.ilike.%${term}%,company.ilike.%${term}%,role.ilike.%${term}%,email.ilike.%${term}%`)
            .limit(5);
          
          if (contacts && contacts.length > 0) {
            for (const c of contacts) {
              if (contextParts.some(cp => cp.includes(c.name) && cp.includes('KONTAKT'))) continue;
              contextParts.push(`👤 KONTAKT: ${c.name}
- Roll: ${c.role || 'Ej angivet'}
- Företag: ${c.company || 'Ej angivet'}
- Telefon: ${c.phone || 'Ej angivet'}
- E-post: ${c.email || 'Ej angivet'}
- Fastighet: ${c.property?.name || 'Ej angivet'}`);
            }
          }
        }
        
        // ============================================
        // SEARCH 9: Todos by search terms
        // ============================================
        for (const term of searchTerms) {
          if (orgPropertyIds.length === 0) continue;
          
          const { data: todos } = await supabase
            .from('property_todos')
            .select('*, property:properties(name)')
            .in('property_id', orgPropertyIds)
            .or(`title.ilike.%${term}%,notes.ilike.%${term}%,category.ilike.%${term}%`)
            .limit(5);
          
          if (todos && todos.length > 0) {
            for (const t of todos) {
              if (contextParts.some(cp => cp.includes(t.title) && cp.includes('ATT GÖRA'))) continue;
              contextParts.push(`✅ ATT GÖRA: ${t.title}
- Status: ${t.completed ? 'Avslutad' : 'Öppen'}
- Prioritet: ${t.priority || 'Ej angivet'}
- Kategori: ${t.category || 'Ej angivet'}
- Deadline: ${t.due_date || 'Ej angivet'}
- Påminnelse: ${t.reminder_date || 'Ej angivet'}
- Fastighet: ${t.property?.name || 'Ej angivet'}
${t.notes ? `- Anteckningar: ${t.notes}` : ''}`);
            }
          }
        }
        
        // ============================================
        // SEARCH 10: Work orders by search terms
        // ============================================
        for (const term of searchTerms) {
          if (orgPropertyIds.length === 0) continue;
          
          const { data: workOrders } = await supabase
            .from('work_orders')
            .select('*, property:properties(name), component:components(name)')
            .in('property_id', orgPropertyIds)
            .or(`action.ilike.%${term}%,contractor.ilike.%${term}%,comments.ilike.%${term}%,quarter.ilike.%${term}%`)
            .limit(10);
          
          if (workOrders && workOrders.length > 0) {
            for (const wo of workOrders) {
              if (foundWorkOrderIds.has(wo.id)) continue;
              foundWorkOrderIds.add(wo.id);
              
              let statusText = wo.status;
              if (wo.status === 'not_started') statusText = 'Ej påbörjad';
              else if (wo.status === 'awaiting_quote') statusText = 'Väntar på offert';
              else if (wo.status === 'ordered') statusText = 'Beställd';
              else if (wo.status === 'completed') statusText = 'Avslutad';
              else if (wo.status === 'archived') statusText = 'Arkiverad';
              
              contextParts.push(`🛠️ ARBETSORDER: ${wo.action}
- Status: ${statusText}
- Prioritet: ${wo.priority || 'Ej angivet'}
- Entreprenör: ${wo.contractor || 'Ej angivet'}
- Komponent: ${wo.component?.name || 'Ej angivet'}
- Deadline: ${wo.due_date || 'Ej angivet'}
- Kvartal: ${wo.quarter || 'Ej angivet'}
- Pris: ${wo.price ? wo.price.toLocaleString('sv-SE') + ' kr' : 'Ej angivet'}
- Fastighet: ${wo.property?.name || 'Ej angivet'}
${wo.comments ? `- Kommentar: ${wo.comments}` : ''}`);
            }
          }
        }
        
        // ============================================
        // SEARCH 11: Recurring costs by search terms
        // ============================================
        for (const term of searchTerms) {
          if (orgPropertyIds.length === 0) continue;
          
          const { data: recurringCosts } = await supabase
            .from('property_recurring_costs')
            .select('*, property:properties(name), account_codes(code, description)')
            .in('property_id', orgPropertyIds)
            .or(`description.ilike.%${term}%,contractor_name.ilike.%${term}%,contact_person.ilike.%${term}%`)
            .limit(10);
          
          if (recurringCosts && recurringCosts.length > 0) {
            for (const rc of recurringCosts) {
              if (contextParts.some(cp => cp.includes(rc.description) && cp.includes('LÖPANDE KOSTNAD'))) continue;
              
              let rcInfo = `💰 LÖPANDE KOSTNAD: ${rc.description}
- Belopp: ${rc.amount?.toLocaleString('sv-SE')} kr`;
              if (rc.base_interval_months) rcInfo += `\n- Intervall: Var ${rc.base_interval_months}:e månad`;
              if (rc.contractor_name) rcInfo += `\n- Entreprenör: ${rc.contractor_name}`;
              if (rc.contact_person) rcInfo += `\n- Kontaktperson: ${rc.contact_person}`;
              if (rc.next_due_date) rcInfo += `\n- Nästa förfallodatum: ${rc.next_due_date}`;
              if (rc.last_payment_date) rcInfo += `\n- Senaste betalning: ${rc.last_payment_date}`;
              if (rc.account_codes) rcInfo += `\n- Kontokod: ${rc.account_codes.code} - ${rc.account_codes.description}`;
              rcInfo += `\n- Fastighet: ${rc.property?.name || 'Ej angivet'}`;
              
              contextParts.push(rcInfo);
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
      }
    }

    console.log('Calling Lovable AI with context length:', contextInfo.length);

    const systemPrompt = `Du är en hjälpsam AI-assistent för ett fastighetsförvaltningssystem.

VIKTIGA FORMATERINGSREGLER:
1. Använd ALDRIG markdown som *, **, [], #, - eller punktlistor
2. Strukturera ALLTID svaret med tydliga VERSALA RUBRIKER för varje kategori
3. Använd indrag (mellanslag) för underordnad information
4. Separera kategorier med tomrader
5. Skriv belopp med tusentalsavgränsare (220 000 kr)

OBLIGATORISKA KATEGORIER (visa endast de som har data):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FASTIGHETSINFO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Namn: [fastighetens namn]
  Fastighetsnummer: [nummer]
  Adress: [adress]
  Byggår: [år]
  Area/LOA: [m²]
  Typ: [typ]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KOMPONENTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [Komponentnamn]
    Typ: [typ]
    Tillverkare: [tillverkare]
    Status: [status]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UNDERHÅLLSHISTORIK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [Datum]: [Åtgärd]
    Komponent: [komponent]
    Kostnad: [belopp] kr
    Leverantör: [leverantör]
    Bifogade dokument (om finns):
      - [filnamn]
        PROTOKOLLINNEHÅLL: [text från serviceprotokoll]

VIKTIGT OM SERVICEPROTOKOLL/DOKUMENT:
- När du hittar PROTOKOLLINNEHÅLL i kontexten, CITERA alltid relevant information
- Lyft fram AVVIKELSER, ANMÄRKNINGAR och REKOMMENDATIONER från protokoll
- Om protokollet nämner brister eller förslag på åtgärder, presentera dem tydligt
- Koppla alltid avvikelser till relevant komponent och datum

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROJEKT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [Projektnamn] ([projektnummer])
    Status: [status]
    Budget: [belopp] kr
    Utfall: [belopp] kr

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ARBETSORDRAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [Åtgärd/Beskrivning]
    Status: [Väntande/Pågående/Avslutad]
    Entreprenör: [entreprenör]
    Deadline: [datum]
    Pris: [belopp] kr

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LÖPANDE KOSTNADER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [Beskrivning]: [belopp] kr ([intervall])

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENERGIDEKLARATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Energiklass: [klass]
  Primärenergital: [värde] kWh/m²

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KONTAKTER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [Namn] ([roll])
    Telefon: [nummer]
    E-post: [e-post]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DRIFTUPPGIFTER (drift_tasks - återkommande underhåll/kontroller)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [Uppgiftsnamn] ([kvartal] [år])
    Planerat: [antal], Rapporterat: [antal]
    Status: [X av Y rapporterade]
    Beskrivning: [beskrivning om finns]

OBS: Driftuppgifter har INTE prioritet eller deadline - visa aldrig dessa fält för driftuppgifter!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ATT GÖRA (property_todos - engångsuppgifter)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [Uppgiftstitel]
    Prioritet: [prioritet]
    Deadline: [datum]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DOKUMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [Dokumentnamn]

Svara alltid på svenska. Basera dina svar på informationen i systemet.
Avsluta med en kort fråga om användaren vill veta mer.
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

// Extract meaningful search terms from user message
function extractSearchTerms(message: string): string[] {
  // Remove common Swedish question words and filler words
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
  
  // Look for quoted strings
  const quotedMatch = message.match(/"([^"]+)"/g);
  if (quotedMatch) {
    words.push(...quotedMatch.map(m => m.replace(/"/g, '').trim()));
  }
  
  // Remove duplicates and filter out years (they're handled separately)
  const yearPattern = /^20[2-3]\d$/;
  return [...new Set(words)].filter(w => !yearPattern.test(w));
}

// Parse time-based queries (Q1, Q2, 2024, 2025, etc.)
interface TimeFilter {
  quarter?: number;
  year?: number;
}

function parseTimeFilter(message: string): TimeFilter {
  const filter: TimeFilter = {};
  
  // Match quarters: Q1, Q2, Q3, Q4, kvartal 1, etc.
  const quarterMatch = message.match(/(?:q|kvartal\s*)([1-4])/i);
  if (quarterMatch) {
    filter.quarter = parseInt(quarterMatch[1]);
  }
  
  // Match years: 2024, 2025, 2026, etc.
  const yearMatch = message.match(/\b(20[2-3]\d)\b/);
  if (yearMatch) {
    filter.year = parseInt(yearMatch[1]);
  }
  
  return filter;
}
