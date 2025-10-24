import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import JSZip from 'https://esm.sh/jszip@3.10.1';

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
    // Get authorization header and extract JWT token
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

    // Extract JWT token from Bearer header
    const jwt = authHeader.replace('Bearer ', '');

    // Create client with service role to bypass RLS for data export
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Verify JWT token and get user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(jwt);

    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: ' + (userError?.message || 'Invalid token') }),
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

    console.log(`Export completed. Total properties: ${exportData.properties?.length || 0}`);

    // Create ZIP file with readable text files
    const zip = new JSZip();
    
    // Add README file
    const exportTimestamp = new Date().toISOString();
    const readmeContent = `DATA EXPORT FRÅN ${orgData?.name || 'ORGANIZATION'}
${'='.repeat(60)}

Exporterad: ${exportTimestamp}
Export-typ: ${exportType === 'all' ? 'All data' : exportType === 'user' ? 'Användardata' : 'Valda fastigheter'}

SAMMANFATTNING:
- Fastigheter: ${exportData.properties?.length || 0}
- Våningsplan: ${exportData.floors?.length || 0}
- Komponenter: ${exportData.components?.length || 0}
- Projekt: ${exportData.projects?.length || 0}
- Arbetsordrar: ${exportData.work_orders?.length || 0}
- Dokument: ${exportData.summary.documents_count || 0}

INNEHÅLL:
Denna export innehåller följande filer:
- README.txt (denna fil)
- organization.txt (organisationsinformation)
- properties.txt (fastigheter och adresser)
- components.txt (komponenter och serviceinformation)
- projects.txt (projekt och kostnader)
- work_orders.txt (arbetsordrar)
- documents.txt (dokumentlistor)
- maintenance.txt (underhållshistorik)
- recurring_costs.txt (återkommande kostnader)
- drift_operations.txt (drift och underhåll)
`;
    zip.file('README.txt', readmeContent);

    // Organization info
    if (orgData) {
      const orgContent = `ORGANISATIONSINFORMATION
${'='.repeat(60)}

Namn: ${orgData.name}
ID: ${orgData.id}
Skapad: ${orgData.created_at}
Uppdaterad: ${orgData.updated_at}

PRENUMERATION:
Nivå: ${orgData.subscription_tier || 'Ingen'}
Betalningsstatus: ${orgData.payment_status || 'Okänd'}
Faktureringscykel: ${orgData.billing_cycle || 'Ingen'}
Max fastigheter: ${orgData.max_properties || 0}
Max användare: ${orgData.max_users || 0}

KONTAKT:
Faktura-email: ${orgData.invoice_email || 'Ingen'}
Faktureringskontakt: ${orgData.billing_contact || 'Ingen'}

ANTECKNINGAR:
${orgData.notes || 'Inga anteckningar'}
`;
      zip.file('organization.txt', orgContent);
    }

    // Properties
    if (exportData.properties && exportData.properties.length > 0) {
      let propContent = `FASTIGHETER (${exportData.properties.length})
${'='.repeat(60)}\n\n`;
      
      exportData.properties.forEach((prop: any, index: number) => {
        propContent += `${index + 1}. ${prop.name || 'Namnlös fastighet'}
${'-'.repeat(60)}
ID: ${prop.id}
Adress: ${prop.address || 'Ingen adress'}
Postnummer: ${prop.postal_code || 'Inget'}
Stad: ${prop.city || 'Ingen'}
Area (m²): ${prop.area || 'Okänd'}
Byggnadsår: ${prop.construction_year || 'Okänt'}
Typ: ${prop.property_type || 'Okänd'}
Ägare: ${prop.owner_id || 'Ingen'}
Skapad: ${prop.created_at || 'Okänd'}
Beskrivning: ${prop.description || 'Ingen beskrivning'}

`;
      });
      zip.file('properties.txt', propContent);
    }

    // Components
    if (exportData.components && exportData.components.length > 0) {
      let compContent = `KOMPONENTER (${exportData.components.length})
${'='.repeat(60)}\n\n`;
      
      exportData.components.forEach((comp: any, index: number) => {
        compContent += `${index + 1}. ${comp.name || 'Namnlös komponent'}
${'-'.repeat(60)}
ID: ${comp.id}
Typ: ${comp.type || 'Okänd'}
Kategori: ${comp.category || 'Ingen'}
Serienummer: ${comp.serial_number || 'Inget'}
Registreringsnummer: ${comp.registration_number || 'Inget'}
Installationsdatum: ${comp.installation_date || 'Okänt'}
Förväntad livslängd (år): ${comp.expected_lifetime || 'Okänd'}
Nästa servicedatum: ${comp.next_service_date || 'Inget planerat'}
Servicekostnad: ${comp.service_cost || 0} kr
Serviceintervall (år): ${comp.service_interval || 'Inget'}
Position (x, y): ${comp.position_x || 0}, ${comp.position_y || 0}
Placering: ${comp.placement || 'Ingen'}
Beskrivning: ${comp.description || 'Ingen beskrivning'}
Anteckningar: ${comp.notes || 'Inga anteckningar'}

`;
      });
      zip.file('components.txt', compContent);
    }

    // Projects
    if (exportData.projects && exportData.projects.length > 0) {
      let projContent = `PROJEKT (${exportData.projects.length})
${'='.repeat(60)}\n\n`;
      
      exportData.projects.forEach((proj: any, index: number) => {
        projContent += `${index + 1}. ${proj.name || 'Namnlöst projekt'}
${'-'.repeat(60)}
ID: ${proj.id}
Status: ${proj.status || 'Okänd'}
Prioritet: ${proj.priority || 'Normal'}
Budgeterad kostnad: ${proj.budgeted_cost || 0} kr
Faktisk kostnad: ${proj.actual_cost || 0} kr
Startdatum: ${proj.start_date || 'Inget'}
Slutdatum: ${proj.end_date || 'Inget'}
Förväntad slutdatum: ${proj.expected_completion_date || 'Inget'}
Typ: ${proj.project_type || 'Okänd'}
Beskrivning: ${proj.description || 'Ingen beskrivning'}
Anteckningar: ${proj.notes || 'Inga anteckningar'}

`;
      });
      zip.file('projects.txt', projContent);
    }

    // Work Orders
    if (exportData.work_orders && exportData.work_orders.length > 0) {
      let woContent = `ARBETSORDRAR (${exportData.work_orders.length})
${'='.repeat(60)}\n\n`;
      
      exportData.work_orders.forEach((wo: any, index: number) => {
        woContent += `${index + 1}. Arbetsorder
${'-'.repeat(60)}
ID: ${wo.id}
Åtgärd: ${wo.action || 'Ingen åtgärd'}
Status: ${wo.status || 'Okänd'}
Prioritet: ${wo.priority || 'Normal'}
Kategori: ${wo.category || 'Ingen'}
Planerat datum: ${wo.scheduled_date || 'Inget'}
Slutfört datum: ${wo.completed_date || 'Ej slutfört'}
Uppskattad kostnad: ${wo.estimated_cost || 0} kr
Faktisk kostnad: ${wo.actual_cost || 0} kr
Leverantör: ${wo.supplier || 'Ingen'}
Kontaktperson: ${wo.contact_person || 'Ingen'}
Beskrivning: ${wo.description || 'Ingen beskrivning'}
Anteckningar: ${wo.notes || 'Inga anteckningar'}

`;
      });
      zip.file('work_orders.txt', woContent);
    }

    // Maintenance History
    if (exportData.maintenance_history && exportData.maintenance_history.length > 0) {
      let maintContent = `UNDERHÅLLSHISTORIK (${exportData.maintenance_history.length})
${'='.repeat(60)}\n\n`;
      
      exportData.maintenance_history.forEach((maint: any, index: number) => {
        maintContent += `${index + 1}. Underhållshändelse
${'-'.repeat(60)}
ID: ${maint.id}
Typ: ${maint.maintenance_type || 'Okänd'}
Datum: ${maint.maintenance_date || 'Okänt'}
Kostnad: ${maint.cost || 0} kr
Utförd av: ${maint.performed_by || 'Okänd'}
Beskrivning: ${maint.description || 'Ingen beskrivning'}
Anteckningar: ${maint.notes || 'Inga anteckningar'}

`;
      });
      zip.file('maintenance.txt', maintContent);
    }

    // Recurring Costs
    if (exportData.recurring_costs && exportData.recurring_costs.length > 0) {
      let rcContent = `ÅTERKOMMANDE KOSTNADER (${exportData.recurring_costs.length})
${'='.repeat(60)}\n\n`;
      
      exportData.recurring_costs.forEach((rc: any, index: number) => {
        rcContent += `${index + 1}. ${rc.description || 'Namnlös kostnad'}
${'-'.repeat(60)}
ID: ${rc.id}
Kategori: ${rc.category || 'Ingen'}
Belopp: ${rc.amount || 0} kr
Frekvens: ${rc.frequency || 'Okänd'}
Startdatum: ${rc.start_date || 'Inget'}
Slutdatum: ${rc.end_date || 'Inget'}
Nästa faktureringsdatum: ${rc.next_billing_date || 'Inget'}
Leverantör: ${rc.supplier || 'Ingen'}
Kontonummer: ${rc.account_code || 'Inget'}
Beskrivning: ${rc.description || 'Ingen beskrivning'}

`;
      });
      zip.file('recurring_costs.txt', rcContent);
    }

    // Drift Operations
    if (exportData.drift_tasks && exportData.drift_tasks.length > 0) {
      let driftContent = `DRIFT OCH UNDERHÅLL (${exportData.drift_tasks.length})
${'='.repeat(60)}\n\n`;
      
      exportData.drift_tasks.forEach((task: any, index: number) => {
        driftContent += `${index + 1}. ${task.title || 'Namnlös uppgift'}
${'-'.repeat(60)}
ID: ${task.id}
Kategori: ${task.category_id || 'Ingen'}
Kvartal: ${task.quarter || 'Inget'}
År: ${task.year || 'Inget'}
Prioritet: ${task.priority || 'Normal'}
Planerat antal: ${task.planned_count || 0}
Rapporterat antal: ${task.reported_count || 0}
Status: ${task.status || 'Okänd'}
Deadline: ${task.deadline || 'Ingen'}
Beskrivning: ${task.description || 'Ingen beskrivning'}

`;
      });
      zip.file('drift_operations.txt', driftContent);
    }

    // Documents summary
    const docContent = `DOKUMENT ÖVERSIKT
${'='.repeat(60)}

FASTIGHETS DOKUMENT: ${exportData.property_documents?.length || 0}
PROJEKT DOKUMENT: ${exportData.project_documents?.length || 0}
KOMPONENT DOKUMENT: ${exportData.component_documents?.length || 0}

Total antal dokument: ${exportData.summary.documents_count || 0}

Observera: Endast metadata för dokument exporteras. 
Själva dokumentfilerna finns kvar i systemet.
`;
    zip.file('documents.txt', docContent);

    // Create filename
    const timestamp = new Date().toISOString().split('T')[0];
    let baseFilename: string;
    
    if (exportType === 'properties' && requestPropertyIds && requestPropertyIds.length > 0) {
      const propCount = requestPropertyIds.length;
      baseFilename = `${orgData?.name || 'organization'}_${propCount}_properties_${timestamp}`;
    } else if (exportType === 'user' && userId) {
      baseFilename = `${orgData?.name || 'organization'}_user_data_${timestamp}`;
    } else {
      baseFilename = `${orgData?.name || 'organization'}_full_export_${timestamp}`;
    }

    // Generate ZIP as base64
    const zipBase64 = await zip.generateAsync({ type: 'base64' });

    // Return the ZIP file
    return new Response(
      JSON.stringify({
        success: true,
        zipData: zipBase64,
        filename: `${baseFilename}.zip`,
        summary: exportData.summary,
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
