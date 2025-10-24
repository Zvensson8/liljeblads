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
      contacts_count: exportData.property_contacts?.length || 0,
      notes_count: exportData.property_notes?.length || 0,
      todos_count: exportData.property_todos?.length || 0,
      maintenance_count: exportData.maintenance_history?.length || 0,
      recurring_costs_count: exportData.recurring_costs?.length || 0,
      drift_tasks_count: exportData.drift_tasks?.length || 0,
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
    const readmeContent = `╔═══════════════════════════════════════════════════════════════╗
║           DATA EXPORT FRÅN ${(orgData?.name || 'ORGANIZATION').toUpperCase().padEnd(30)}║
╚═══════════════════════════════════════════════════════════════╝

📅 EXPORTDATUM: ${new Date(exportTimestamp).toLocaleString('sv-SE')}
📦 EXPORT-TYP: ${exportType === 'all' ? 'All data' : exportType === 'user' ? 'Användardata' : 'Valda fastigheter'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SAMMANFATTNING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏢 Fastigheter ................ ${exportData.properties?.length || 0} st
🏗️  Våningsplan ................ ${exportData.floors?.length || 0} st
⚙️  Komponenter ................ ${exportData.components?.length || 0} st
📋 Projekt .................... ${exportData.projects?.length || 0} st
🔧 Arbetsordrar ............... ${exportData.work_orders?.length || 0} st
👥 Kontakter .................. ${exportData.property_contacts?.length || 0} st
📝 Anteckningar ............... ${exportData.property_notes?.length || 0} st
✅ Att göra-uppgifter ......... ${exportData.property_todos?.length || 0} st
🔨 Underhållshändelser ........ ${exportData.maintenance_history?.length || 0} st
💰 Återkommande kostnader ..... ${exportData.recurring_costs?.length || 0} st
📊 Driftuppgifter ............. ${exportData.drift_tasks?.length || 0} st
📄 Dokument (metadata) ........ ${exportData.summary.documents_count || 0} st

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📁 FILSTRUKTUR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Denna export innehåller följande filer:

00_README.txt ........................ Denna fil
01_organization.txt .................. Organisationsinformation och prenumeration
02_properties.txt .................... Fastighetsregister med adresser och detaljer
03_floors.txt ........................ Våningsplansregister
04_contacts.txt ...................... Kontaktpersoner för fastigheter
05_notes.txt ......................... Anteckningar kopplade till fastigheter
06_todos.txt ......................... Att göra-listor och påminnelser
07_components.txt .................... Komponentregister med teknisk information
08_component_purchase.txt ............ Inköpsinformation för komponenter
09_maintenance.txt ................... Underhållshistorik och servicehändelser
10_projects.txt ...................... Projektregister och status
11_project_budget.txt ................ Projektbudgetar och prognoser
12_project_costs.txt ................. Faktiska projektkostnader
13_project_checklist.txt ............. Projektchecklistor
14_project_activity.txt .............. Projektaktivitetsloggar
15_work_orders.txt ................... Arbetsordrar och serviceuppdrag
16_recurring_costs.txt ............... Återkommande kostnader och prenumerationer
17_drift_categories.txt .............. Driftkategorier
18_drift_operations.txt .............. Drift och underhållsuppgifter
19_drift_task_components.txt ......... Komponenter kopplade till driftuppgifter
20_documents.txt ..................... Dokumentregister och metadata

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ℹ️  VIKTIG INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  DOKUMENTFILER: Endast metadata för dokument exporteras. 
   Själva dokumentfilerna finns kvar i systemet och måste laddas 
   ner separat om så önskas.

🔒 DATAFORMAT: All data är exporterad i lättläst textformat med 
   UTF-8 kodning för korrekt visning av svenska tecken.

📞 SUPPORT: Vid frågor om exporten, kontakta er systemadministratör.

`;
    zip.file('00_README.txt', readmeContent);

    // Organization info
    if (orgData) {
      const orgContent = `╔═══════════════════════════════════════════════════════════════╗
║                  ORGANISATIONSINFORMATION                     ║
╚═══════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 GRUNDLÄGGANDE INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Organisationsnamn: ${orgData.name || 'Ej angivet'}
Organisations-ID: ${orgData.id}
Skapad datum: ${orgData.created_at ? new Date(orgData.created_at).toLocaleString('sv-SE') : 'Okänt'}
Senast uppdaterad: ${orgData.updated_at ? new Date(orgData.updated_at).toLocaleString('sv-SE') : 'Okänt'}

${orgData.logo_url ? `🎨 Logotyp: ${orgData.logo_url}\n` : ''}${orgData.primary_color ? `🎨 Primär färg: ${orgData.primary_color}\n` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💳 PRENUMERATIONSINFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Prenumerationsnivå: ${orgData.subscription_tier || 'Ingen'}
Betalningsstatus: ${orgData.payment_status || 'Okänd'}
Faktureringscykel: ${orgData.billing_cycle || 'Ingen'}

Gränser:
  • Max antal fastigheter: ${orgData.max_properties || 0}
  • Max antal användare: ${orgData.max_users || 0}

Betalningsinformation:
  • Nästa fakturadatum: ${orgData.next_billing_date || 'Ej angivet'}
  • Senaste betalning: ${orgData.last_payment_date || 'Ej angivet'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 KONTAKTINFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Faktura-email: ${orgData.invoice_email || 'Ej angivet'}
Faktureringskontakt: ${orgData.billing_contact || 'Ej angivet'}

${orgData.notes ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 ANTECKNINGAR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${orgData.notes}
` : ''}
`;
      zip.file('01_organization.txt', orgContent);
    }

    // Properties
    if (exportData.properties && exportData.properties.length > 0) {
      let propContent = `╔═══════════════════════════════════════════════════════════════╗
║                    FASTIGHETSREGISTER                         ║
║                   ${exportData.properties.length} fastigheter totalt                           ║
╚═══════════════════════════════════════════════════════════════╝

`;
      
      exportData.properties.forEach((prop: any, index: number) => {
        propContent += `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ${(index + 1).toString().padStart(3, '0')}. ${(prop.name || 'Namnlös fastighet').toUpperCase().substring(0, 50).padEnd(50)} ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

📋 GRUNDINFORMATION
├─ ID: ${prop.id}
├─ Fastighetnummer: ${prop.property_number || 'Ej angivet'}
├─ LÅ-nummer: ${prop.loa || 'Ej angivet'}
├─ Typ: ${prop.property_type || 'Ej angiven'}
└─ Organisation: ${prop.organization_id || 'Ingen'}

📍 ADRESSINFORMATION
├─ Adress: ${prop.address || 'Ej angiven'}
├─ Fakturaadress: ${prop.invoice_address || 'Samma som ovan'}
└─ Ägare-ID: ${prop.owner_id || 'Ingen'}

📐 TEKNISKA DETALJER
├─ Byggnadsår: ${prop.construction_year || 'Okänt'}
├─ Area: ${prop.area_sqm ? `${prop.area_sqm} m²` : 'Ej angivet'}
└─ Skapad i systemet: ${prop.created_at ? new Date(prop.created_at).toLocaleString('sv-SE') : 'Okänt'}
    Senast uppdaterad: ${prop.updated_at ? new Date(prop.updated_at).toLocaleString('sv-SE') : 'Okänt'}

${prop.description ? `📝 BESKRIVNING
${prop.description}

` : ''}`;
      });
      zip.file('02_properties.txt', propContent);
    }

    // Floors
    if (exportData.floors && exportData.floors.length > 0) {
      let floorContent = `╔═══════════════════════════════════════════════════════════════╗
║                    VÅNINGSPLANSREGISTER                       ║
║                   ${exportData.floors.length} våningsplan totalt                        ║
╚═══════════════════════════════════════════════════════════════╝

`;
      
      exportData.floors.forEach((floor: any, index: number) => {
        floorContent += `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ${(index + 1).toString().padStart(3, '0')}. ${(floor.name || 'Namnlös våning').substring(0, 50).padEnd(50)} ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

ID: ${floor.id}
Fastighet-ID: ${floor.property_id}
Våningsnivå: ${floor.level !== null && floor.level !== undefined ? floor.level : 'Ej angiven'}
${floor.drawing_url ? `Ritning: ${floor.drawing_url}` : 'Ingen ritning uppladdad'}
Skapad: ${floor.created_at ? new Date(floor.created_at).toLocaleString('sv-SE') : 'Okänt'}
Uppdaterad: ${floor.updated_at ? new Date(floor.updated_at).toLocaleString('sv-SE') : 'Okänt'}

`;
      });
      zip.file('03_floors.txt', floorContent);
    }

    // Contacts
    if (exportData.property_contacts && exportData.property_contacts.length > 0) {
      let contactContent = `╔═══════════════════════════════════════════════════════════════╗
║                      KONTAKTREGISTER                          ║
║                   ${exportData.property_contacts.length} kontakter totalt                        ║
╚═══════════════════════════════════════════════════════════════╝

`;
      
      exportData.property_contacts.forEach((contact: any, index: number) => {
        contactContent += `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ${(index + 1).toString().padStart(3, '0')}. ${(contact.name || 'Namnlös kontakt').substring(0, 50).padEnd(50)} ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

👤 Namn: ${contact.name}
🏢 Företag: ${contact.company || 'Ej angivet'}
💼 Roll: ${contact.role || 'Ej angiven'}
📞 Telefon: ${contact.phone || 'Ej angivet'}
📧 Email: ${contact.email || 'Ej angivet'}
🏠 Fastighet-ID: ${contact.property_id}
📅 Tillagd: ${contact.created_at ? new Date(contact.created_at).toLocaleString('sv-SE') : 'Okänt'}

`;
      });
      zip.file('04_contacts.txt', contactContent);
    }

    // Notes
    if (exportData.property_notes && exportData.property_notes.length > 0) {
      let notesContent = `╔═══════════════════════════════════════════════════════════════╗
║                     ANTECKNINGSREGISTER                       ║
║                   ${exportData.property_notes.length} anteckningar totalt                     ║
╚═══════════════════════════════════════════════════════════════╝

`;
      
      exportData.property_notes.forEach((note: any, index: number) => {
        notesContent += `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ Anteckning ${(index + 1).toString().padStart(3, '0')}                                           ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

ID: ${note.id}
Fastighet-ID: ${note.property_id}
Skapad: ${note.created_at ? new Date(note.created_at).toLocaleString('sv-SE') : 'Okänt'}
Uppdaterad: ${note.updated_at ? new Date(note.updated_at).toLocaleString('sv-SE') : 'Okänt'}

📝 INNEHÅLL:
${note.content || 'Ingen text'}

${'-'.repeat(63)}

`;
      });
      zip.file('05_notes.txt', notesContent);
    }

    // Todos
    if (exportData.property_todos && exportData.property_todos.length > 0) {
      let todosContent = `╔═══════════════════════════════════════════════════════════════╗
║                    ATT GÖRA-REGISTER                          ║
║                   ${exportData.property_todos.length} uppgifter totalt                         ║
╚═══════════════════════════════════════════════════════════════╝

`;
      
      exportData.property_todos.forEach((todo: any, index: number) => {
        todosContent += `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ${(index + 1).toString().padStart(3, '0')}. ${(todo.title || 'Namnlös uppgift').substring(0, 50).padEnd(50)} ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

${todo.completed ? '✅ STATUS: Slutförd' : '⏳ STATUS: Ej slutförd'}
🏠 Fastighet-ID: ${todo.property_id}
📅 Förfallodatum: ${todo.due_date || 'Inget satt'}
⏰ Påminnelsedatum: ${todo.reminder_date || 'Ingen påminnelse'}
📧 Påminnelse-email: ${todo.reminder_email || 'Ingen'}
📅 Skapad: ${todo.created_at ? new Date(todo.created_at).toLocaleString('sv-SE') : 'Okänt'}
📅 Uppdaterad: ${todo.updated_at ? new Date(todo.updated_at).toLocaleString('sv-SE') : 'Okänt'}

${todo.notes ? `📝 ANTECKNINGAR:
${todo.notes}
` : ''}
`;
      });
      zip.file('06_todos.txt', todosContent);
    }

    // Components
    if (exportData.components && exportData.components.length > 0) {
      let compContent = `╔═══════════════════════════════════════════════════════════════╗
║                    KOMPONENTREGISTER                          ║
║                   ${exportData.components.length} komponenter totalt                         ║
╚═══════════════════════════════════════════════════════════════╝

`;
      
      exportData.components.forEach((comp: any, index: number) => {
        compContent += `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ${(index + 1).toString().padStart(3, '0')}. ${(comp.name || 'Namnlös komponent').substring(0, 50).padEnd(50)} ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

🆔 IDENTIFIKATION
├─ ID: ${comp.id}
├─ Typ: ${comp.type || 'Okänd'}
├─ Kategori: ${comp.category || 'Ingen'}
├─ Serienummer: ${comp.serial_number || 'Inget'}
├─ Registreringsnummer: ${comp.registration_number || 'Inget'}
└─ Fastighet-ID: ${comp.property_id || 'Ingen'}
    Vånings-ID: ${comp.floor_id || 'Ingen'}

📅 LIVSCYKEL
├─ Installationsdatum: ${comp.installation_date || 'Okänt'}
├─ Förväntad livslängd: ${comp.expected_lifetime ? `${comp.expected_lifetime} år` : 'Okänd'}
└─ Skapad i systemet: ${comp.created_at ? new Date(comp.created_at).toLocaleString('sv-SE') : 'Okänt'}
    Senast uppdaterad: ${comp.updated_at ? new Date(comp.updated_at).toLocaleString('sv-SE') : 'Okänt'}

🔧 SERVICE
├─ Nästa servicedatum: ${comp.next_service_date || 'Inget planerat'}
├─ Servicekostnad: ${comp.service_cost ? `${comp.service_cost} kr` : 'Ej angiven'}
└─ Serviceintervall: ${comp.service_interval ? `${comp.service_interval} månader` : 'Inget'}

📍 PLACERING
├─ Position (x, y): ${comp.position_x || 0}, ${comp.position_y || 0}
├─ Rotation: ${comp.rotation || 0}°
├─ Skalning: ${comp.scale_x || 1} × ${comp.scale_y || 1}
└─ Placeringsbeskrivning: ${comp.placement || 'Ingen'}

${comp.description ? `📝 BESKRIVNING
${comp.description}

` : ''}${comp.notes ? `📋 ANTECKNINGAR
${comp.notes}

` : ''}`;
      });
      zip.file('07_components.txt', compContent);
    }

    // Component Purchase Info
    if (exportData.component_purchase_info && exportData.component_purchase_info.length > 0) {
      let purchaseContent = `╔═══════════════════════════════════════════════════════════════╗
║                 INKÖPSINFORMATION KOMPONENTER                 ║
║                   ${exportData.component_purchase_info.length} inköp totalt                            ║
╚═══════════════════════════════════════════════════════════════╝

`;
      
      exportData.component_purchase_info.forEach((purchase: any, index: number) => {
        purchaseContent += `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ Inköp ${(index + 1).toString().padStart(3, '0')}                                                ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Komponent-ID: ${purchase.component_id}
Inköpskostnad: ${purchase.purchase_cost ? `${purchase.purchase_cost} kr` : 'Ej angiven'}
Inköpsdatum: ${purchase.purchase_date || 'Ej angivet'}
Garantitid: ${purchase.warranty_years ? `${purchase.warranty_years} år` : 'Ej angiven'}
Förväntad livslängd: ${purchase.expected_lifespan_years ? `${purchase.expected_lifespan_years} år` : 'Ej angiven'}
Registrerad: ${purchase.created_at ? new Date(purchase.created_at).toLocaleString('sv-SE') : 'Okänt'}
Uppdaterad: ${purchase.updated_at ? new Date(purchase.updated_at).toLocaleString('sv-SE') : 'Okänt'}

`;
      });
      zip.file('08_component_purchase.txt', purchaseContent);
    }

    // Projects
    if (exportData.projects && exportData.projects.length > 0) {
      let projContent = `╔═══════════════════════════════════════════════════════════════╗
║                      PROJEKTREGISTER                          ║
║                   ${exportData.projects.length} projekt totalt                              ║
╚═══════════════════════════════════════════════════════════════╝

`;
      
      exportData.projects.forEach((proj: any, index: number) => {
        const budgetVariance = proj.budgeted_cost && proj.actual_cost 
          ? proj.actual_cost - proj.budgeted_cost 
          : null;
        const budgetPercentage = proj.budgeted_cost && proj.actual_cost && proj.budgeted_cost > 0
          ? ((proj.actual_cost / proj.budgeted_cost) * 100).toFixed(1)
          : null;
        
        projContent += `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ${(index + 1).toString().padStart(3, '0')}. ${(proj.name || 'Namnlöst projekt').substring(0, 50).padEnd(50)} ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

📋 GRUNDINFORMATION
├─ ID: ${proj.id}
├─ Fastighet-ID: ${proj.property_id}
├─ Status: ${proj.status || 'Okänd'}
├─ Prioritet: ${proj.priority || 'Normal'}
└─ Typ: ${proj.project_type || 'Okänd'}

💰 EKONOMI
├─ Budgeterad kostnad: ${proj.budgeted_cost ? `${proj.budgeted_cost.toLocaleString('sv-SE')} kr` : 'Ej angiven'}
├─ Faktisk kostnad: ${proj.actual_cost ? `${proj.actual_cost.toLocaleString('sv-SE')} kr` : '0 kr'}
${budgetVariance !== null ? `├─ Budgetavvikelse: ${budgetVariance.toLocaleString('sv-SE')} kr (${budgetPercentage}% av budget)` : ''}
└─ Status: ${budgetVariance && budgetVariance > 0 ? '⚠️ Över budget' : budgetVariance && budgetVariance < 0 ? '✅ Under budget' : '✓ I budget'}

📅 TIDPLAN
├─ Startdatum: ${proj.start_date || 'Ej angivet'}
├─ Slutdatum: ${proj.end_date || 'Ej angivet'}
├─ Förväntat slutdatum: ${proj.expected_completion_date || 'Ej angivet'}
└─ Skapad: ${proj.created_at ? new Date(proj.created_at).toLocaleString('sv-SE') : 'Okänt'}
    Uppdaterad: ${proj.updated_at ? new Date(proj.updated_at).toLocaleString('sv-SE') : 'Okänt'}

${proj.description ? `📝 BESKRIVNING
${proj.description}

` : ''}${proj.notes ? `📋 ANTECKNINGAR
${proj.notes}

` : ''}`;
      });
      zip.file('10_projects.txt', projContent);
    }

    // Project Budget
    if (exportData.project_budget && exportData.project_budget.length > 0) {
      let budgetContent = `╔═══════════════════════════════════════════════════════════════╗
║                    PROJEKTBUDGETAR                            ║
║                   ${exportData.project_budget.length} budgetposter totalt                      ║
╚═══════════════════════════════════════════════════════════════╝

`;
      
      exportData.project_budget.forEach((budget: any, index: number) => {
        budgetContent += `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ${(index + 1).toString().padStart(3, '0')}. ${(budget.description || 'Namnlös budgetpost').substring(0, 46).padEnd(46)} ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Projekt-ID: ${budget.project_id}
Kategori: ${budget.category || 'Ej angiven'}
Budgeterat belopp: ${budget.budgeted_amount ? `${budget.budgeted_amount.toLocaleString('sv-SE')} kr` : '0 kr'}
Prognostiserat belopp: ${budget.forecasted_amount ? `${budget.forecasted_amount.toLocaleString('sv-SE')} kr` : 'Ej angivet'}
Skapad: ${budget.created_at ? new Date(budget.created_at).toLocaleString('sv-SE') : 'Okänt'}

`;
      });
      zip.file('11_project_budget.txt', budgetContent);
    }

    // Project Costs
    if (exportData.project_costs && exportData.project_costs.length > 0) {
      let costsContent = `╔═══════════════════════════════════════════════════════════════╗
║                     PROJEKTKOSTNADER                          ║
║                   ${exportData.project_costs.length} kostnadsposter totalt                    ║
╚═══════════════════════════════════════════════════════════════╝

`;
      
      exportData.project_costs.forEach((cost: any, index: number) => {
        costsContent += `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ${(index + 1).toString().padStart(3, '0')}. ${(cost.description || 'Namnlös kostnad').substring(0, 50).padEnd(50)} ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Projekt-ID: ${cost.project_id}
Belopp: ${cost.amount ? `${cost.amount.toLocaleString('sv-SE')} kr` : '0 kr'}
Datum: ${cost.cost_date || 'Ej angivet'}
Kategori: ${cost.category || 'Ej angiven'}
Aktör: ${cost.actor || 'Ej angiven'}
Registrerad av: ${cost.created_by || 'Okänd'}
Registreringsdatum: ${cost.created_at ? new Date(cost.created_at).toLocaleString('sv-SE') : 'Okänt'}

`;
      });
      zip.file('12_project_costs.txt', costsContent);
    }

    // Project Checklist
    if (exportData.project_checklist && exportData.project_checklist.length > 0) {
      let checklistContent = `╔═══════════════════════════════════════════════════════════════╗
║                   PROJEKTCHECKLISTOR                          ║
║                   ${exportData.project_checklist.length} checklistpunkter totalt                   ║
╚═══════════════════════════════════════════════════════════════╝

`;
      
      exportData.project_checklist.forEach((item: any, index: number) => {
        checklistContent += `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ${(index + 1).toString().padStart(3, '0')}. ${(item.title || 'Namnlös punkt').substring(0, 50).padEnd(50)} ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

${item.completed ? '✅ STATUS: Slutförd' : '⏳ STATUS: Ej slutförd'}
Projekt-ID: ${item.project_id}
Kategori: ${item.category || 'Ej angiven'}
${item.completed_at ? `Slutförd: ${new Date(item.completed_at).toLocaleString('sv-SE')}` : ''}
${item.completed_by ? `Slutförd av: ${item.completed_by}` : ''}
Skapad: ${item.created_at ? new Date(item.created_at).toLocaleString('sv-SE') : 'Okänt'}

${item.description ? `📝 BESKRIVNING:
${item.description}
` : ''}
`;
      });
      zip.file('13_project_checklist.txt', checklistContent);
    }

    // Project Activity
    if (exportData.project_activity && exportData.project_activity.length > 0) {
      let activityContent = `╔═══════════════════════════════════════════════════════════════╗
║                  PROJEKTAKTIVITETSLOGG                        ║
║                   ${exportData.project_activity.length} aktiviteter totalt                        ║
╚═══════════════════════════════════════════════════════════════╝

`;
      
      exportData.project_activity.forEach((activity: any, index: number) => {
        activityContent += `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ Aktivitet ${(index + 1).toString().padStart(3, '0')}                                            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Projekt-ID: ${activity.project_id}
Aktivitetstyp: ${activity.activity_type || 'Okänd'}
Utförd av: ${activity.performed_by || 'Okänd'}
Tidpunkt: ${activity.created_at ? new Date(activity.created_at).toLocaleString('sv-SE') : 'Okänt'}

📝 BESKRIVNING:
${activity.description || 'Ingen beskrivning'}

${activity.metadata ? `📊 METADATA:
${JSON.stringify(activity.metadata, null, 2)}
` : ''}
`;
      });
      zip.file('14_project_activity.txt', activityContent);
    }

    // Work Orders
    if (exportData.work_orders && exportData.work_orders.length > 0) {
      let woContent = `╔═══════════════════════════════════════════════════════════════╗
║                    ARBETSORDERREGISTER                        ║
║                   ${exportData.work_orders.length} arbetsordrar totalt                         ║
╚═══════════════════════════════════════════════════════════════╝

`;
      
      exportData.work_orders.forEach((wo: any, index: number) => {
        const statusEmoji = wo.status === 'completed' ? '✅' : wo.status === 'in_progress' ? '🔄' : '⏳';
        const priorityEmoji = wo.priority === 'high' ? '🔴' : wo.priority === 'medium' ? '🟡' : '🟢';
        
        woContent += `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ${(index + 1).toString().padStart(3, '0')}. ${(wo.action || 'Ingen åtgärd').substring(0, 50).padEnd(50)} ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

📋 STATUS OCH PRIORITET
├─ Status: ${statusEmoji} ${wo.status || 'Okänd'}
├─ Prioritet: ${priorityEmoji} ${wo.priority || 'Normal'}
└─ Kvartal: ${wo.quarter || 'Ej angivet'}

🏢 FASTIGHET OCH KATEGORI
├─ Fastighet-ID: ${wo.property_id}
└─ Kategori: ${wo.category || 'Ingen'}

👥 KONTAKTER
├─ Entreprenör: ${wo.contractor || 'Ej angiven'}
└─ Kontaktperson: ${wo.contact_person || 'Ingen'}

💰 EKONOMI
├─ Pris: ${wo.price ? `${wo.price.toLocaleString('sv-SE')} kr` : 'Ej angivet'}

📅 TIDSPLAN
├─ Förfallodatum: ${wo.due_date || 'Inget'}
├─ Skapad: ${wo.created_at ? new Date(wo.created_at).toLocaleString('sv-SE') : 'Okänt'}
└─ Uppdaterad: ${wo.updated_at ? new Date(wo.updated_at).toLocaleString('sv-SE') : 'Okänt'}

🔔 PÅMINNELSER
├─ Påminnelser aktiverade: ${wo.reminder_enabled ? 'Ja' : 'Nej'}
├─ Frekvens: ${wo.reminder_frequency || 'Ingen'}
├─ Mottagare: ${wo.reminder_recipient_email || 'Ingen'}
└─ Senast skickad: ${wo.last_reminder_sent ? new Date(wo.last_reminder_sent).toLocaleString('sv-SE') : 'Aldrig'}

${wo.comments ? `💬 KOMMENTARER:
${wo.comments}
` : ''}
`;
      });
      zip.file('15_work_orders.txt', woContent);
    }

    // Maintenance History
    if (exportData.maintenance_history && exportData.maintenance_history.length > 0) {
      let maintContent = `╔═══════════════════════════════════════════════════════════════╗
║                   UNDERHÅLLSHISTORIK                          ║
║                   ${exportData.maintenance_history.length} underhållshändelser totalt                 ║
╚═══════════════════════════════════════════════════════════════╝

`;
      
      exportData.maintenance_history.forEach((maint: any, index: number) => {
        maintContent += `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ Underhåll ${(index + 1).toString().padStart(3, '0')}                                            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Komponent-ID: ${maint.component_id}
Åtgärdstyp: ${maint.action_type || 'Okänd'}
Kategori: ${maint.category || 'Ej angiven'}
${maint.is_warranty ? '✅ Garantiärende' : ''}
Datum: ${maint.performed_date || 'Okänt'}
Leverantör: ${maint.supplier || 'Ej angiven'}

💰 EKONOMI
Förväntad kostnad: ${maint.expected_cost ? `${maint.expected_cost.toLocaleString('sv-SE')} kr` : 'Ej angiven'}
Faktisk kostnad: ${maint.cost ? `${maint.cost.toLocaleString('sv-SE')} kr` : '0 kr'}
${maint.expected_cost && maint.cost ? `Avvikelse: ${(maint.cost - maint.expected_cost).toLocaleString('sv-SE')} kr` : ''}

📅 REGISTRERING
Skapad: ${maint.created_at ? new Date(maint.created_at).toLocaleString('sv-SE') : 'Okänt'}
Uppdaterad: ${maint.updated_at ? new Date(maint.updated_at).toLocaleString('sv-SE') : 'Okänt'}

${maint.notes ? `📝 ANTECKNINGAR:
${maint.notes}
` : ''}
`;
      });
      zip.file('09_maintenance.txt', maintContent);
    }

    // Recurring Costs
    if (exportData.recurring_costs && exportData.recurring_costs.length > 0) {
      let rcContent = `╔═══════════════════════════════════════════════════════════════╗
║                 ÅTERKOMMANDE KOSTNADER                        ║
║                   ${exportData.recurring_costs.length} kostnader totalt                          ║
╚═══════════════════════════════════════════════════════════════╝

`;
      
      exportData.recurring_costs.forEach((rc: any, index: number) => {
        const annualCost = rc.amount && rc.base_interval_months 
          ? (rc.amount * (12 / rc.base_interval_months)).toFixed(2)
          : null;
        
        rcContent += `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ${(index + 1).toString().padStart(3, '0')}. ${(rc.description || 'Namnlös kostnad').substring(0, 50).padEnd(50)} ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

🏠 FASTIGHET
Fastighet-ID: ${rc.property_id}

💰 EKONOMI
├─ Belopp per period: ${rc.amount ? `${rc.amount.toLocaleString('sv-SE')} kr` : '0 kr'}
${annualCost ? `├─ Beräknad årskostnad: ${parseFloat(annualCost).toLocaleString('sv-SE')} kr` : ''}
└─ Kontonummer: ${rc.account_code_id || 'Inget'}

📅 FREKVENS OCH PERIOD
├─ Basintervall: ${rc.base_interval_months ? `${rc.base_interval_months} månader` : 'Ej angivet'}
├─ Variation: ${rc.interval_variation_months ? `±${rc.interval_variation_months} månader` : 'Ingen'}
├─ Nästa förfallodatum: ${rc.next_due_date || 'Inget'}
├─ Senaste betalning: ${rc.last_payment_date || 'Ingen'}
├─ Användarval datum: ${rc.user_selected_date || 'Inget'}
├─ Kvartal (start): ${rc.calculated_quarter_start || 'Ej beräknat'}
└─ Kvartal (slut): ${rc.calculated_quarter_end || 'Ej beräknat'}

👥 LEVERANTÖR
├─ Entreprenör: ${rc.contractor_name || 'Ej angiven'}
└─ Kontaktperson: ${rc.contact_person || 'Ingen'}

📅 REGISTRERING
├─ Skapad: ${rc.created_at ? new Date(rc.created_at).toLocaleString('sv-SE') : 'Okänt'}
└─ Uppdaterad: ${rc.updated_at ? new Date(rc.updated_at).toLocaleString('sv-SE') : 'Okänt'}

`;
      });
      zip.file('16_recurring_costs.txt', rcContent);
    }

    // Drift Categories
    if (exportData.drift_categories && exportData.drift_categories.length > 0) {
      let catContent = `╔═══════════════════════════════════════════════════════════════╗
║                    DRIFTKATEGORIER                            ║
║                   ${exportData.drift_categories.length} kategorier totalt                         ║
╚═══════════════════════════════════════════════════════════════╝

`;
      
      exportData.drift_categories.forEach((cat: any, index: number) => {
        catContent += `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ${(index + 1).toString().padStart(3, '0')}. ${(cat.name || 'Namnlös kategori').substring(0, 50).padEnd(50)} ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

ID: ${cat.id}
Fastighet-ID: ${cat.property_id}
${cat.parent_id ? `Överordnad kategori: ${cat.parent_id}` : 'Huvudkategori'}
Skapad: ${cat.created_at ? new Date(cat.created_at).toLocaleString('sv-SE') : 'Okänt'}
Uppdaterad: ${cat.updated_at ? new Date(cat.updated_at).toLocaleString('sv-SE') : 'Okänt'}

`;
      });
      zip.file('17_drift_categories.txt', catContent);
    }

    // Drift Operations
    if (exportData.drift_tasks && exportData.drift_tasks.length > 0) {
      let driftContent = `╔═══════════════════════════════════════════════════════════════╗
║                  DRIFT OCH UNDERHÅLL                          ║
║                   ${exportData.drift_tasks.length} driftuppgifter totalt                       ║
╚═══════════════════════════════════════════════════════════════╝

`;
      
      exportData.drift_tasks.forEach((task: any, index: number) => {
        const completionPercent = task.planned_count > 0 
          ? ((task.reported_count / task.planned_count) * 100).toFixed(1)
          : 0;
        const statusEmoji = task.status === 'completed' ? '✅' : task.status === 'remaining' ? '⏳' : '❌';
        
        driftContent += `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ${(index + 1).toString().padStart(3, '0')}. ${(task.title || 'Namnlös uppgift').substring(0, 50).padEnd(50)} ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

📋 GRUNDINFORMATION
├─ ID: ${task.id}
├─ Fastighet-ID: ${task.property_id}
├─ Kategori-ID: ${task.category_id || 'Ingen'}
└─ Prioritet: ${task.priority || 'Normal'}

📅 TIDSPLAN
├─ År: ${task.year || 'Inget'}
├─ Kvartal: ${task.quarter || 'Inget'}
└─ Deadline: ${task.deadline || 'Ingen'}

📊 FRAMSTEG
├─ Status: ${statusEmoji} ${task.status || 'Okänd'}
├─ Planerat antal: ${task.planned_count || 0}
├─ Rapporterat antal: ${task.reported_count || 0}
└─ Färdigställande: ${completionPercent}%

📅 REGISTRERING
├─ Skapad: ${task.created_at ? new Date(task.created_at).toLocaleString('sv-SE') : 'Okänt'}
└─ Uppdaterad: ${task.updated_at ? new Date(task.updated_at).toLocaleString('sv-SE') : 'Okänt'}

${task.description ? `📝 BESKRIVNING:
${task.description}
` : ''}
`;
      });
      zip.file('18_drift_operations.txt', driftContent);
    }

    // Drift Task Components
    if (exportData.drift_task_components && exportData.drift_task_components.length > 0) {
      let taskCompContent = `╔═══════════════════════════════════════════════════════════════╗
║              KOMPONENTER I DRIFTUPPGIFTER                     ║
║                   ${exportData.drift_task_components.length} kopplade komponenter totalt                ║
╚═══════════════════════════════════════════════════════════════╝

`;
      
      exportData.drift_task_components.forEach((tc: any, index: number) => {
        taskCompContent += `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ Komponent ${(index + 1).toString().padStart(3, '0')}                                            ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

${tc.is_reported ? '✅ Rapporterad' : '⏳ Ej rapporterad'}
Uppgift-ID: ${tc.task_id}
Komponent-ID: ${tc.component_id || 'Ingen (manuell post)'}
Objektnamn: ${tc.object_name || 'Ej angivet'}
Serie-ID: ${tc.series_id || 'Inget'}
Registreringsnummer: ${tc.registration_number || 'Inget'}
${tc.manually_edited ? '✏️ Manuellt redigerad' : ''}
${tc.auto_detected_from ? `🤖 Automatiskt detekterad från: ${tc.auto_detected_from}` : ''}
Skapad: ${tc.created_at ? new Date(tc.created_at).toLocaleString('sv-SE') : 'Okänt'}

`;
      });
      zip.file('19_drift_task_components.txt', taskCompContent);
    }

    // Documents summary
    const docContent = `╔═══════════════════════════════════════════════════════════════╗
║                    DOKUMENTREGISTER                           ║
║                   ${exportData.summary.documents_count || 0} dokument totalt                            ║
╚═══════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 SAMMANFATTNING PER KATEGORI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏢 Fastighetsdokument ........... ${exportData.property_documents?.length || 0} st
📋 Projektdokument .............. ${exportData.project_documents?.length || 0} st
⚙️  Komponentdokument ............ ${exportData.component_documents?.length || 0} st

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 FASTIGHETSDOKUMENT (${exportData.property_documents?.length || 0})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${exportData.property_documents && exportData.property_documents.length > 0 
  ? exportData.property_documents.map((doc: any, i: number) => `
${i + 1}. ${doc.name || 'Namnlöst dokument'}
   └─ Fastighet-ID: ${doc.property_id}
   └─ Filstorlek: ${doc.file_size ? `${(doc.file_size / 1024).toFixed(2)} KB` : 'Okänd'}
   └─ Typ: ${doc.mime_type || 'Okänd'}
   └─ Version: ${doc.version || 1} ${doc.is_latest ? '(Senaste)' : ''}
   └─ Uppladdad: ${doc.created_at ? new Date(doc.created_at).toLocaleString('sv-SE') : 'Okänt'}
   └─ URL: ${doc.file_url || 'Ingen'}
`).join('\n')
  : '\nInga fastighetsdokument\n'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 PROJEKTDOKUMENT (${exportData.project_documents?.length || 0})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${exportData.project_documents && exportData.project_documents.length > 0
  ? exportData.project_documents.map((doc: any, i: number) => `
${i + 1}. ${doc.name || 'Namnlöst dokument'}
   └─ Projekt-ID: ${doc.project_id}
   └─ Mapp: ${doc.folder || 'Allmänt'}
   └─ Filstorlek: ${doc.file_size ? `${(doc.file_size / 1024).toFixed(2)} KB` : 'Okänd'}
   └─ Typ: ${doc.mime_type || 'Okänd'}
   └─ Version: ${doc.version || 1} ${doc.is_latest ? '(Senaste)' : ''}
   └─ Uppladdad av: ${doc.uploaded_by || 'Okänd'}
   └─ Uppladdad: ${doc.created_at ? new Date(doc.created_at).toLocaleString('sv-SE') : 'Okänt'}
   └─ URL: ${doc.file_url || 'Ingen'}
`).join('\n')
  : '\nInga projektdokument\n'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚙️  KOMPONENTDOKUMENT (${exportData.component_documents?.length || 0})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${exportData.component_documents && exportData.component_documents.length > 0
  ? exportData.component_documents.map((doc: any, i: number) => `
${i + 1}. ${doc.name || 'Namnlöst dokument'}
   └─ Komponent-ID: ${doc.component_id}
   └─ Filstorlek: ${doc.file_size ? `${(doc.file_size / 1024).toFixed(2)} KB` : 'Okänd'}
   └─ Typ: ${doc.mime_type || 'Okänd'}
   └─ Version: ${doc.version || 1} ${doc.is_latest ? '(Senaste)' : ''}
   └─ Uppladdad: ${doc.created_at ? new Date(doc.created_at).toLocaleString('sv-SE') : 'Okänt'}
   └─ URL: ${doc.file_url || 'Ingen'}
`).join('\n')
  : '\nInga komponentdokument\n'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  VIKTIG INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  Endast metadata för dokument exporteras i denna översikt.
📁 Själva dokumentfilerna finns kvar i systemet.
💾 För att ladda ner dokumentfiler, använd nedladdningsfunktionen
   i systemet för respektive dokument.

`;
    zip.file('20_documents.txt', docContent);

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
