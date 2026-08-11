import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Parse "Q3 2026" / "kvartal 3 2026" from payload or free text → quarter label + quarter-end due_date */
function resolveQuarterAndDueDate(
  payload: Record<string, unknown>,
  reasoning?: string | null,
): { quarter: string | null; dueDate: string | null } {
  const explicitDue =
    (payload.due_date as string) ||
    (payload.suggested_date as string) ||
    null;
  let quarter =
    (payload.quarter as string) ||
    (payload.planned_quarter as string) ||
    null;

  const blob = [
    quarter,
    payload.action,
    payload.reasoning,
    reasoning,
  ]
    .filter(Boolean)
    .join(' ');

  // Q3 2026 | Q3-2026 | q3/2026
  const qMatch =
    blob.match(/\bQ\s*([1-4])\s*[-/ ]?\s*(20\d{2})\b/i) ||
    blob.match(/\bkvartal\s*([1-4])\s*(?:år\s*)?(20\d{2})\b/i);

  if (!quarter && qMatch) {
    quarter = `Q${qMatch[1]} ${qMatch[2]}`;
  }

  if (explicitDue) {
    return { quarter: quarter || null, dueDate: explicitDue.slice(0, 10) };
  }

  if (qMatch) {
    const q = Number(qMatch[1]);
    const year = Number(qMatch[2]);
    // End of quarter as planning due date
    const monthEnd = [3, 6, 9, 12][q - 1];
    const day = [31, 30, 30, 31][q - 1];
    const dueDate = `${year}-${String(monthEnd).padStart(2, '0')}-${day}`;
    return { quarter: quarter || `Q${q} ${year}`, dueDate };
  }

  return { quarter: quarter || null, dueDate: null };
}

async function resolvePropertyId(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  if (payload.property_id) return String(payload.property_id);
  if (payload.property_name) {
    const { data } = await supabase
      .from('properties')
      .select('id')
      .eq('organization_id', orgId)
      .ilike('name', `%${String(payload.property_name)}%`)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

function generateProjectNumber(propertyNumber?: string | null): string {
  const base = (propertyNumber || 'PRJ').replace(/\s+/g, '-').slice(0, 24);
  const year = new Date().getFullYear();
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `${base}-${year}-${suffix}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { actionId } = await req.json();
    
    if (!actionId) {
      throw new Error('actionId is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authorization header required' }), {
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
      return new Response(JSON.stringify({ error: 'Session expired' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = userData.user.id;

    // Rate limiting: 10 requests per minute for execute-ai-action
    const rateResult = await checkRateLimit(userId, {
      endpoint: 'execute-ai-action',
      maxRequests: 10,
      windowSeconds: 60,
    });
    const rateLimited = rateLimitResponse(rateResult, corsHeaders);
    if (rateLimited) return rateLimited;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load action first (service role), then verify membership on action.organization_id
    const { data: action, error: actionError } = await supabase
      .from('ai_suggested_actions')
      .select('*')
      .eq('id', actionId)
      .single();

    if (actionError || !action) {
      console.error('Action lookup error:', actionError);
      return new Response(JSON.stringify({ error: 'Action not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const orgId = action.organization_id as string;
    if (!orgId) {
      return new Response(JSON.stringify({ error: 'Action missing organization' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (!membership) {
      const { data: founderRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'founder')
        .maybeSingle();
      if (!founderRole) {
        return new Response(
          JSON.stringify({ error: 'Not a member of the action organization' }),
          {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }
    }

    if (action.status !== 'approved') {
      return new Response(JSON.stringify({ error: 'Action is not approved' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result: Record<string, any> = {};
    let error: string | null = null;

    try {
      switch (action.action_type) {
        case 'create_work_order': {
          const payload = (action.payload || {}) as Record<string, unknown>;
          // Resolve property: explicit id → property_name → component → first in org
          let propertyId = (payload.property_id as string) || null;
          let componentId = (payload.component_id as string) || null;

          if (!propertyId && payload.property_name) {
            const { data: byName } = await supabase
              .from('properties')
              .select('id')
              .eq('organization_id', orgId)
              .ilike('name', String(payload.property_name))
              .limit(1)
              .maybeSingle();
            propertyId = byName?.id ?? null;
          }

          if (componentId && !propertyId) {
            const { data: comp } = await supabase
              .from('components')
              .select('id, property_id')
              .eq('id', componentId)
              .maybeSingle();
            if (comp?.property_id) propertyId = comp.property_id;
          }

          // Resolve component by name on property if only component_name was set
          if (!componentId && propertyId && payload.component_name) {
            const { data: byCompName } = await supabase
              .from('components')
              .select('id')
              .eq('property_id', propertyId)
              .ilike('name', `%${String(payload.component_name)}%`)
              .limit(1)
              .maybeSingle();
            componentId = byCompName?.id ?? null;
          }

          if (!propertyId) {
            const { data: properties } = await supabase
              .from('properties')
              .select('id')
              .eq('organization_id', orgId)
              .limit(1);
            if (properties && properties.length > 0) {
              propertyId = properties[0].id;
            }
          }

          if (!propertyId) {
            throw new Error('Ingen fastighet hittades för att skapa arbetsordern');
          }

          // Map structured fields from AI payload (not only free-text reasoning)
          const priceRaw =
            payload.price_estimate ?? payload.price ?? payload.estimated_price;
          const price =
            priceRaw != null && !Number.isNaN(Number(priceRaw))
              ? Number(priceRaw)
              : null;

          const contractor =
            (payload.contractor as string) ||
            (payload.supplier as string) ||
            (payload.entreprenor as string) ||
            null;

          const { quarter, dueDate } = resolveQuarterAndDueDate(payload, action.reasoning);

          const reasoning = String(action.reasoning || payload.reasoning || '').trim();
          const commentsParts = [
            reasoning ? `Jarvis Motivering: ${reasoning}` : null,
            payload.component_name && !componentId
              ? `Komponent (ej matchad): ${payload.component_name}`
              : null,
          ].filter(Boolean);

          const { data: workOrder, error: woError } = await supabase
            .from('work_orders')
            .insert({
              property_id: propertyId,
              component_id: componentId,
              action:
                (payload.action as string) ||
                (payload.title as string) ||
                'Jarvis-föreslagen åtgärd',
              priority: (payload.priority as string) || 'medium',
              status: 'not_started',
              contractor,
              quarter,
              comments: commentsParts.length
                ? commentsParts.join('\n')
                : 'Skapad via Jarvis-förslag',
              due_date: dueDate || (payload.due_date as string) || null,
              price,
            })
            .select()
            .single();

          if (woError) throw woError;
          result = {
            work_order_id: workOrder.id,
            component_id: componentId,
            property_id: propertyId,
            contractor,
            quarter,
            due_date: dueDate,
            price,
            source: payload.source || null,
          };
          console.log('Created work order:', workOrder.id, 'component:', componentId);
          break;
        }

        case 'create_todo': {
          const payload = (action.payload || {}) as Record<string, unknown>;
          let propertyId = await resolvePropertyId(supabase, orgId, payload);

          if (!propertyId) {
            const { data: properties } = await supabase
              .from('properties')
              .select('id')
              .eq('organization_id', orgId)
              .limit(1);
            propertyId = properties?.[0]?.id ?? null;
          }

          if (!propertyId) {
            throw new Error('Ingen fastighet hittades för att-göra');
          }

          const { data: todo, error: todoError } = await supabase
            .from('property_todos')
            .insert({
              property_id: propertyId,
              title: (payload.title as string) || 'Jarvis-föreslagen uppgift',
              description:
                (payload.description as string) ||
                (action.reasoning as string) ||
                null,
              due_date: (payload.due_date as string) || null,
              priority: (payload.priority as string) || 'medium',
              completed: false,
            })
            .select()
            .single();

          if (todoError) throw todoError;
          result = { todo_id: todo.id, property_id: propertyId };
          break;
        }

        case 'schedule_maintenance': {
          const payload = (action.payload || {}) as Record<string, unknown>;
          let propertyId = await resolvePropertyId(supabase, orgId, payload);
          if (!propertyId) {
            const { data: properties } = await supabase
              .from('properties')
              .select('id')
              .eq('organization_id', orgId)
              .limit(1);
            propertyId = properties?.[0]?.id ?? null;
          }
          if (!propertyId) throw new Error('Ingen fastighet för underhåll');

          const { data: workOrder, error: woError } = await supabase
            .from('work_orders')
            .insert({
              property_id: propertyId,
              action: `Schemalagt underhåll: ${payload.maintenance_type || 'Allmänt underhåll'}`,
              priority: 'medium',
              status: 'not_started',
              comments: `Jarvis: ${action.reasoning || 'Ingen motivering'}`,
              due_date: (payload.suggested_date as string) || null,
            })
            .select()
            .single();

          if (woError) throw woError;
          result = { work_order_id: workOrder.id, property_id: propertyId };
          break;
        }

        case 'create_project': {
          const payload = (action.payload || {}) as Record<string, unknown>;
          let propertyId = await resolvePropertyId(supabase, orgId, payload);
          if (!propertyId) {
            throw new Error(
              'Ange fastighet (property_name/property_id) för att skapa projekt',
            );
          }

          // Ensure property belongs to org
          const { data: prop } = await supabase
            .from('properties')
            .select('id, property_number, organization_id')
            .eq('id', propertyId)
            .maybeSingle();
          if (!prop || prop.organization_id !== orgId) {
            throw new Error('Fastigheten tillhör inte organisationen');
          }

          const currentYear = new Date().getFullYear();
          const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
          const projectType = (['investering', 'underhall', 'energi', 'annat'] as const).includes(
            payload.type as 'investering',
          )
            ? (payload.type as string)
            : 'underhall';

          const projectNumber =
            String(payload.project_number || '').trim() ||
            generateProjectNumber(prop.property_number);

          const budgetRaw = payload.budget;
          const budget =
            budgetRaw != null && !Number.isNaN(Number(budgetRaw))
              ? Number(budgetRaw)
              : null;

          const { data: project, error: projError } = await supabase
            .from('projects')
            .insert({
              property_id: propertyId,
              name:
                (payload.name as string) ||
                (payload.title as string) ||
                'Jarvis-föreslaget projekt',
              description:
                (payload.description as string) ||
                (action.reasoning as string) ||
                null,
              status: 'planerat',
              type: projectType,
              project_number: projectNumber,
              year: Number(payload.year) || currentYear,
              start_quarter: Number(payload.start_quarter) || currentQuarter,
              budget,
              created_by: userId,
            })
            .select()
            .single();

          if (projError) throw projError;
          result = {
            project_id: project.id,
            project_number: project.project_number,
            property_id: propertyId,
          };
          break;
        }

        case 'create_property_note': {
          const payload = (action.payload || {}) as Record<string, unknown>;
          const propertyId = await resolvePropertyId(supabase, orgId, payload);
          if (!propertyId) {
            throw new Error('Ange fastighet för anteckningen');
          }
          const content = String(payload.content || '').trim();
          if (!content) throw new Error('Anteckningstext saknas');

          const { data: prop } = await supabase
            .from('properties')
            .select('id, organization_id')
            .eq('id', propertyId)
            .maybeSingle();
          if (!prop || prop.organization_id !== orgId) {
            throw new Error('Fastigheten tillhör inte organisationen');
          }

          const { data: note, error: noteError } = await supabase
            .from('property_notes')
            .insert({
              property_id: propertyId,
              content,
            })
            .select()
            .single();

          if (noteError) throw noteError;
          result = { note_id: note.id, property_id: propertyId };
          break;
        }

        case 'update_property_invoice_address': {
          const payload = (action.payload || {}) as Record<string, unknown>;
          const propertyId = await resolvePropertyId(supabase, orgId, payload);
          if (!propertyId) {
            throw new Error('Ange fastighet för fakturaadress');
          }
          const invoiceAddress = String(payload.invoice_address || '').trim();
          if (!invoiceAddress) throw new Error('invoice_address saknas');

          const { data: prop } = await supabase
            .from('properties')
            .select('id, organization_id, name')
            .eq('id', propertyId)
            .maybeSingle();
          if (!prop || prop.organization_id !== orgId) {
            throw new Error('Fastigheten tillhör inte organisationen');
          }

          const { data: updated, error: upErr } = await supabase
            .from('properties')
            .update({ invoice_address: invoiceAddress })
            .eq('id', propertyId)
            .select('id, name, invoice_address')
            .single();

          if (upErr) throw upErr;
          result = {
            property_id: updated.id,
            property_name: updated.name,
            invoice_address: updated.invoice_address,
          };
          break;
        }

        case 'create_property': {
          const payload = (action.payload || {}) as Record<string, unknown>;
          const name = String(payload.name || '').trim();
          if (!name) throw new Error('Fastighetsnamn krävs');

          const insert: Record<string, unknown> = {
            name,
            organization_id: orgId,
            owner_id: userId,
            address: (payload.address as string) || null,
            property_number: (payload.property_number as string) || null,
            property_type: (payload.property_type as string) || null,
            invoice_address: (payload.invoice_address as string) || null,
            description: (payload.description as string) || null,
          };
          if (payload.construction_year != null) {
            insert.construction_year = Number(payload.construction_year);
          }
          if (payload.area_sqm != null) {
            insert.area_sqm = Number(payload.area_sqm);
          }

          const { data: created, error: cErr } = await supabase
            .from('properties')
            .insert(insert)
            .select('id, name, address, invoice_address')
            .single();

          if (cErr) throw cErr;
          result = {
            property_id: created.id,
            name: created.name,
            address: created.address,
            invoice_address: created.invoice_address,
          };
          break;
        }

        case 'update_property': {
          const payload = (action.payload || {}) as Record<string, unknown>;
          const propertyId = await resolvePropertyId(supabase, orgId, payload);
          if (!propertyId) {
            throw new Error('Ange fastighet att uppdatera');
          }

          const { data: prop } = await supabase
            .from('properties')
            .select('id, organization_id')
            .eq('id', propertyId)
            .maybeSingle();
          if (!prop || prop.organization_id !== orgId) {
            throw new Error('Fastigheten tillhör inte organisationen');
          }

          const patch: Record<string, unknown> = {};
          for (const key of [
            'name',
            'address',
            'property_number',
            'property_type',
            'invoice_address',
            'description',
          ] as const) {
            if (payload[key] != null && String(payload[key]).trim() !== '') {
              patch[key] = payload[key];
            }
          }
          if (payload.construction_year != null) {
            patch.construction_year = Number(payload.construction_year);
          }
          if (payload.area_sqm != null) {
            patch.area_sqm = Number(payload.area_sqm);
          }

          if (Object.keys(patch).length === 0) {
            throw new Error('Inga fält att uppdatera');
          }

          const { data: updated, error: upErr } = await supabase
            .from('properties')
            .update(patch)
            .eq('id', propertyId)
            .select('id, name, address, invoice_address, property_number')
            .single();

          if (upErr) throw upErr;
          result = { property_id: updated.id, updated: updated };
          break;
        }

        case 'send_reminder':
        case 'update_component_status':
          result = { message: 'Denna åtgärdstyp stöds inte ännu' };
          break;

        default:
          throw new Error(`Okänd åtgärdstyp: ${action.action_type}`);
      }
    } catch (execError) {
      console.error('Execution error:', execError);
      error = execError instanceof Error ? execError.message : 'Okänt fel';
    }

    // Update action status
    const updateData: Record<string, any> = {
      executed_at: new Date().toISOString(),
    };

    if (error) {
      updateData.status = 'failed';
      updateData.execution_error = error;
    } else {
      updateData.status = 'executed';
      updateData.execution_result = result;
    }

    await supabase
      .from('ai_suggested_actions')
      .update(updateData)
      .eq('id', actionId);

    if (error) {
      return new Response(JSON.stringify({ success: false, error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in execute-ai-action:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
