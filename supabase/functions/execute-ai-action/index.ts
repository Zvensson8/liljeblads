import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .single();

    if (!profile?.organization_id) {
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the action
    const { data: action, error: actionError } = await supabase
      .from('ai_suggested_actions')
      .select('*')
      .eq('id', actionId)
      .eq('organization_id', profile.organization_id)
      .single();

    if (actionError || !action) {
      console.error('Action lookup error:', actionError);
      return new Response(JSON.stringify({ error: 'Action not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
          // Need a property_id - try to find from payload or use first property
          let propertyId = action.payload.property_id;
          
          if (!propertyId) {
            const { data: properties } = await supabase
              .from('properties')
              .select('id')
              .eq('organization_id', profile.organization_id)
              .limit(1);
            
            if (properties && properties.length > 0) {
              propertyId = properties[0].id;
            }
          }

          if (!propertyId) {
            throw new Error('Ingen fastighet hittades för att skapa arbetsordern');
          }

          const { data: workOrder, error: woError } = await supabase
            .from('work_orders')
            .insert({
              property_id: propertyId,
              action: action.payload.action || action.payload.title || 'AI-föreslagen åtgärd',
              priority: action.payload.priority || 'medium',
              status: 'not_started',
              comments: `Skapad via AI-förslag: ${action.reasoning || 'Ingen motivering'}`,
              due_date: action.payload.due_date || null,
            })
            .select()
            .single();

          if (woError) throw woError;
          result = { work_order_id: workOrder.id };
          console.log('Created work order:', workOrder.id);
          break;
        }

        case 'create_todo': {
          let propertyId = action.payload.property_id;
          
          if (!propertyId) {
            const { data: properties } = await supabase
              .from('properties')
              .select('id')
              .eq('organization_id', profile.organization_id)
              .limit(1);
            
            if (properties && properties.length > 0) {
              propertyId = properties[0].id;
            }
          }

          const { data: todo, error: todoError } = await supabase
            .from('property_todos')
            .insert({
              property_id: propertyId,
              title: action.payload.title || 'AI-föreslagen uppgift',
              description: action.payload.description || action.reasoning || null,
              due_date: action.payload.due_date || null,
              priority: action.payload.priority || 'medium',
              completed: false,
            })
            .select()
            .single();

          if (todoError) throw todoError;
          result = { todo_id: todo.id };
          console.log('Created todo:', todo.id);
          break;
        }

        case 'schedule_maintenance': {
          // For now, create a work order for maintenance
          let propertyId = action.payload.property_id;
          
          if (!propertyId) {
            const { data: properties } = await supabase
              .from('properties')
              .select('id')
              .eq('organization_id', profile.organization_id)
              .limit(1);
            
            if (properties && properties.length > 0) {
              propertyId = properties[0].id;
            }
          }

          const { data: workOrder, error: woError } = await supabase
            .from('work_orders')
            .insert({
              property_id: propertyId,
              action: `Schemalagt underhåll: ${action.payload.maintenance_type || 'Allmänt underhåll'}`,
              priority: 'medium',
              status: 'not_started',
              comments: `AI-föreslagen underhållsåtgärd: ${action.reasoning || 'Ingen motivering'}`,
              due_date: action.payload.suggested_date || null,
            })
            .select()
            .single();

          if (woError) throw woError;
          result = { work_order_id: workOrder.id };
          console.log('Created maintenance work order:', workOrder.id);
          break;
        }

        case 'create_project': {
          let propertyId = action.payload.property_id;
          
          if (!propertyId) {
            const { data: properties } = await supabase
              .from('properties')
              .select('id')
              .eq('organization_id', profile.organization_id)
              .limit(1);
            
            if (properties && properties.length > 0) {
              propertyId = properties[0].id;
            }
          }

          if (!propertyId) {
            throw new Error('Ingen fastighet hittades för att skapa projektet');
          }

          const currentYear = new Date().getFullYear();
          const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);

          const { data: project, error: projError } = await supabase
            .from('projects')
            .insert({
              property_id: propertyId,
              name: action.payload.name || action.payload.title || 'AI-föreslaget projekt',
              description: action.payload.description || action.reasoning || null,
              status: 'planerat',
              year: action.payload.year || currentYear,
              start_quarter: action.payload.start_quarter || currentQuarter,
            })
            .select()
            .single();

          if (projError) throw projError;
          result = { project_id: project.id };
          console.log('Created project:', project.id);
          break;
        }

        case 'send_reminder':
        case 'update_component_status':
          // These require more complex implementation
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
