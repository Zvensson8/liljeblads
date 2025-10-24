import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExportRequest {
  organizationId: string;
  exportType: "all" | "user" | "properties";
  userId?: string | null;
  propertyIds?: string[] | null;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    console.log('Authorization header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('No Authorization header found');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Create client with service role to bypass RLS for data export
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Create a separate client with user's auth to verify permissions
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get the user
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: ' + (userError?.message || 'Unknown error') }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`User authenticated: ${user.id}`);

    const { organizationId, exportType, userId, propertyIds: requestPropertyIds }: ExportRequest = await req.json();

    console.log(`Starting export for organization: ${organizationId}, type: ${exportType}, user: ${userId || 'none'}, properties: ${requestPropertyIds?.length || 0}`);

    // Verify user has access to this organization
    const { data: memberData, error: memberError } = await supabaseClient
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single();

    if (memberError || !memberData) {
      console.error('Member verification error:', memberError);
      throw new Error('Not a member of this organization');
    }

    console.log(`User is ${memberData.role} of organization`);

    // Prepare export data structure
    const exportData: any = {
      exported_at: new Date().toISOString(),
      organization_id: organizationId,
      export_type: exportType,
      user_id: userId || null,
      property_ids: requestPropertyIds || null,
    };

    // Fetch organization info
    const { data: orgData } = await supabaseClient
      .from('organizations')
      .select('*')
      .eq('id', organizationId)
      .single();

    exportData.organization = orgData;

    // Fetch properties based on export type
    let propertiesQuery = supabaseClient
      .from('properties')
      .select('*')
      .eq('organization_id', organizationId);

    if (exportType === 'user' && userId) {
      propertiesQuery = propertiesQuery.eq('owner_id', userId);
    } else if (exportType === 'properties' && requestPropertyIds && requestPropertyIds.length > 0) {
      propertiesQuery = propertiesQuery.in('id', requestPropertyIds);
    }

    const { data: properties } = await propertiesQuery;
    exportData.properties = properties || [];

    const propertyIds = properties?.map(p => p.id) || [];

    if (propertyIds.length > 0) {
      // Fetch floors
      const { data: floors } = await supabaseClient
        .from('floors')
        .select('*')
        .in('property_id', propertyIds);
      exportData.floors = floors || [];

      const floorIds = floors?.map(f => f.id) || [];

      // Fetch components
      if (floorIds.length > 0) {
        const { data: components } = await supabaseClient
          .from('components')
          .select('*')
          .in('floor_id', floorIds);
        exportData.components = components || [];

        const componentIds = components?.map(c => c.id) || [];

        if (componentIds.length > 0) {
          // Fetch component documents
          const { data: componentDocs } = await supabaseClient
            .from('component_documents')
            .select('*')
            .in('component_id', componentIds);
          exportData.component_documents = componentDocs || [];

          // Fetch maintenance history
          const { data: maintenance } = await supabaseClient
            .from('maintenance_history')
            .select('*')
            .in('component_id', componentIds);
          exportData.maintenance_history = maintenance || [];

          // Fetch purchase info
          const { data: purchaseInfo } = await supabaseClient
            .from('component_purchase_info')
            .select('*')
            .in('component_id', componentIds);
          exportData.component_purchase_info = purchaseInfo || [];
        }
      }

      // Fetch projects
      const { data: projects } = await supabaseClient
        .from('projects')
        .select('*')
        .in('property_id', propertyIds);
      exportData.projects = projects || [];

      const projectIds = projects?.map(p => p.id) || [];

      if (projectIds.length > 0) {
        // Fetch project costs
        const { data: projectCosts } = await supabaseClient
          .from('project_cost_items')
          .select('*')
          .in('project_id', projectIds);
        exportData.project_costs = projectCosts || [];

        // Fetch project budget
        const { data: projectBudget } = await supabaseClient
          .from('project_budget_items')
          .select('*')
          .in('project_id', projectIds);
        exportData.project_budget = projectBudget || [];

        // Fetch project documents
        const { data: projectDocs } = await supabaseClient
          .from('project_documents')
          .select('*')
          .in('project_id', projectIds);
        exportData.project_documents = projectDocs || [];

        // Fetch project checklist
        const { data: projectChecklist } = await supabaseClient
          .from('project_checklist_items')
          .select('*')
          .in('project_id', projectIds);
        exportData.project_checklist = projectChecklist || [];

        // Fetch project activity log
        const { data: projectActivity } = await supabaseClient
          .from('project_activity_log')
          .select('*')
          .in('project_id', projectIds);
        exportData.project_activity = projectActivity || [];
      }

      // Fetch work orders
      const { data: workOrders } = await supabaseClient
        .from('work_orders')
        .select('*')
        .in('property_id', propertyIds);
      exportData.work_orders = workOrders || [];

      // Fetch property documents
      const { data: propertyDocs } = await supabaseClient
        .from('property_documents')
        .select('*')
        .in('property_id', propertyIds);
      exportData.property_documents = propertyDocs || [];

      // Fetch property contacts
      const { data: propertyContacts } = await supabaseClient
        .from('property_contacts')
        .select('*')
        .in('property_id', propertyIds);
      exportData.property_contacts = propertyContacts || [];

      // Fetch property notes
      const { data: propertyNotes } = await supabaseClient
        .from('property_notes')
        .select('*')
        .in('property_id', propertyIds);
      exportData.property_notes = propertyNotes || [];

      // Fetch property todos
      const { data: propertyTodos } = await supabaseClient
        .from('property_todos')
        .select('*')
        .in('property_id', propertyIds);
      exportData.property_todos = propertyTodos || [];

      // Fetch recurring costs
      const { data: recurringCosts } = await supabaseClient
        .from('property_recurring_costs')
        .select('*')
        .in('property_id', propertyIds);
      exportData.recurring_costs = recurringCosts || [];

      // Fetch drift categories
      const { data: driftCategories } = await supabaseClient
        .from('drift_categories')
        .select('*')
        .in('property_id', propertyIds);
      exportData.drift_categories = driftCategories || [];

      // Fetch drift tasks
      const { data: driftTasks } = await supabaseClient
        .from('drift_tasks')
        .select('*')
        .in('property_id', propertyIds);
      exportData.drift_tasks = driftTasks || [];

      const taskIds = driftTasks?.map(t => t.id) || [];

      if (taskIds.length > 0) {
        // Fetch drift task components
        const { data: taskComponents } = await supabaseClient
          .from('drift_task_components')
          .select('*')
          .in('task_id', taskIds);
        exportData.drift_task_components = taskComponents || [];
      }
    }

    // Create summary
    exportData.summary = {
      properties_count: exportData.properties?.length || 0,
      floors_count: exportData.floors?.length || 0,
      components_count: exportData.components?.length || 0,
      projects_count: exportData.projects?.length || 0,
      work_orders_count: exportData.work_orders?.length || 0,
      documents_count: 
        (exportData.property_documents?.length || 0) + 
        (exportData.project_documents?.length || 0) + 
        (exportData.component_documents?.length || 0),
    };

    // Convert to JSON string
    const jsonData = JSON.stringify(exportData, null, 2);
    const jsonBlob = new Blob([jsonData], { type: 'application/json' });

    // Create filename
    const timestamp = new Date().toISOString().split('T')[0];
    let filename: string;
    
    if (exportType === 'properties' && requestPropertyIds && requestPropertyIds.length > 0) {
      const propCount = requestPropertyIds.length;
      filename = `${orgData?.name || 'organization'}_${propCount}_properties_${timestamp}.json`;
    } else if (exportType === 'user' && userId) {
      filename = `${orgData?.name || 'organization'}_user_data_${timestamp}.json`;
    } else {
      filename = `${orgData?.name || 'organization'}_full_export_${timestamp}.json`;
    }

    console.log(`Export completed. Total properties: ${exportData.properties?.length || 0}`);

    // Return the JSON data directly
    return new Response(
      JSON.stringify({
        success: true,
        data: exportData,
        filename: filename,
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Export error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
