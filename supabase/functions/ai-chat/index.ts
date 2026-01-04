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
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the last user message for context search
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop();
    let contextInfo = '';
    
    if (lastUserMessage?.content) {
      console.log('Searching for context:', lastUserMessage.content);
      
      try {
        // Extract search terms from the user message
        const searchTerms = extractSearchTerms(lastUserMessage.content);
        console.log('Extracted search terms:', searchTerms);
        
        const contextParts: string[] = [];
        const foundPropertyIds = new Set<string>();
        const foundComponentIds = new Set<string>();
        
        // Search properties and gather ALL related data
        for (const term of searchTerms) {
          const { data: properties } = await supabase
            .from('properties')
            .select('*')
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
                energyHistoryResult
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
                supabase.from('property_energy_history').select('*').eq('property_id', p.id).order('recorded_at', { ascending: false }).limit(5)
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
                      propInfo += `\n      - ${mh.performed_date}: ${mh.action_type}${mh.cost ? ` (${mh.cost} kr)` : ''}${mh.notes ? ` - ${mh.notes}` : ''}`;
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
              
              contextParts.push(propInfo);
            }
          }
        }
        
        // Search components directly (if not already found via property)
        for (const term of searchTerms) {
          const { data: components } = await supabase
            .from('components')
            .select('*, property:properties(name, address), maintenance_history(*), component_purchase_info(*), component_documents(*)')
            .or(`name.ilike.%${term}%,type.ilike.%${term}%,manufacturer.ilike.%${term}%,serial_number.ilike.%${term}%,registration_number.ilike.%${term}%`)
            .limit(5);
          
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
                for (const mh of c.maintenance_history.slice(0, 5)) {
                  compInfo += `\n  - ${mh.performed_date}: ${mh.action_type}`;
                  if (mh.cost) compInfo += ` (${mh.cost} kr)`;
                  if (mh.supplier) compInfo += ` - ${mh.supplier}`;
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
        
        // Search projects directly
        for (const term of searchTerms) {
          const { data: projects } = await supabase
            .from('projects')
            .select('*, property:properties(name), project_cost_items(*), project_checklist_items(*), project_notes(*), project_documents(*)')
            .or(`name.ilike.%${term}%,project_number.ilike.%${term}%,description.ilike.%${term}%,project_manager.ilike.%${term}%`)
            .limit(5);
          
          if (projects && projects.length > 0) {
            for (const pr of projects) {
              if (contextParts.some(cp => cp.includes(`PROJEKT: ${pr.name}`))) continue;
              
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
                for (const ci of pr.project_cost_items.slice(0, 10)) {
                  projInfo += `\n  - ${ci.description}: ${ci.amount?.toLocaleString('sv-SE')} kr (${ci.cost_date})`;
                  if (ci.actor) projInfo += ` - ${ci.actor}`;
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
        
        // Search contacts
        for (const term of searchTerms) {
          const { data: contacts } = await supabase
            .from('property_contacts')
            .select('*, property:properties(name)')
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
        
        // Search todos
        for (const term of searchTerms) {
          const { data: todos } = await supabase
            .from('property_todos')
            .select('*, property:properties(name)')
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
Du hjälper användare med frågor om:
- Fastigheter och deras information (adress, area, byggår, energideklaration, etc.)
- Komponenter (ventilation, hissar, värmesystem, deras status och underhållshistorik)
- Projekt och underhållsarbeten (budget, kostnader, checklista, aktörer)
- Driftuppgifter och service
- Kostnader och budget (löpande kostnader, projektutfall)
- Dokument och anteckningar
- Kontakter och leverantörer
- Uppgifter (todos) och påminnelser
- Våningsplan och rumsplacering

Svara alltid på svenska. Var koncis och hjälpsam. Basera dina svar på den information som finns i systemet.
Om du hittar relevant data, presentera den på ett strukturerat och lättläst sätt.
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
    'fastigheten', 'komponenten', 'projektet', 'fastighet', 'komponent', 'projekt',
    'alla', 'allt', 'vilka', 'vilken', 'vilket', 'denna', 'detta', 'dessa',
    'min', 'mitt', 'mina', 'din', 'ditt', 'dina', 'sin', 'sitt', 'sina',
    'vår', 'vårt', 'våra', 'er', 'ert', 'era', 'deras'
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
  
  // Remove duplicates
  return [...new Set(words)];
}
