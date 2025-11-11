import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string);

interface ProjectData {
  id: string;
  project_number: string;
  name: string;
  status: string;
  project_manager: string | null;
  budget: number;
  actual_cost: number;
  forecast: number;
  start_quarter: number;
  end_quarter: number;
  year: number;
  properties: {
    name: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting monthly project summary generation...");

    const { userId, userEmail, organizationId } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch ongoing projects
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select(`
        id,
        project_number,
        name,
        status,
        project_manager,
        budget,
        actual_cost,
        forecast,
        start_quarter,
        end_quarter,
        year,
        properties(name)
      `)
      .eq('properties.organization_id', organizationId)
      .in('status', ['planerat', 'pagaende'])
      .order('created_at', { ascending: false });

    if (projectsError) {
      console.error("Error fetching projects:", projectsError);
      throw projectsError;
    }

    // Fetch organization details
    const { data: organization } = await supabase
      .from('organizations')
      .select('name, logo_url')
      .eq('id', organizationId)
      .single();

    const typedProjects = projects as unknown as ProjectData[];

    // Calculate summary statistics
    const totalProjects = typedProjects.length;
    const totalBudget = typedProjects.reduce((sum, p) => sum + (p.budget || 0), 0);
    const totalActual = typedProjects.reduce((sum, p) => sum + (p.actual_cost || 0), 0);
    const totalForecast = typedProjects.reduce((sum, p) => sum + (p.forecast || 0), 0);
    const onBudgetCount = typedProjects.filter(p => (p.actual_cost || 0) <= (p.budget || 0)).length;
    const overBudgetCount = totalProjects - onBudgetCount;

    const budgetDeviation = totalBudget > 0 
      ? ((totalActual - totalBudget) / totalBudget * 100).toFixed(1)
      : '0';

    // Format currency
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('sv-SE', { 
        style: 'currency', 
        currency: 'SEK',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(amount);
    };

    const escapeHtml = (text: string): string => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    // Generate project rows
    const projectRows = typedProjects.map(project => {
      const completion = project.budget > 0 
        ? Math.min(100, (project.actual_cost / project.budget * 100))
        : 0;
      
      const statusClass = project.status === 'pagaende' ? 'success' : 'warning';
      const statusLabel = project.status === 'pagaende' ? 'Pågående' : 'Planerat';

      return `
        <tr>
          <td>
            <strong>${escapeHtml(project.project_number)}</strong><br>
            <small style="color: #6b7280;">${escapeHtml(project.name)}</small>
          </td>
          <td>${escapeHtml(project.properties.name)}</td>
          <td>
            <span class="badge badge-${statusClass}">${statusLabel}</span>
          </td>
          <td>${escapeHtml(project.project_manager || '-')}</td>
          <td>${formatCurrency(project.budget || 0)}</td>
          <td>${formatCurrency(project.actual_cost || 0)}</td>
          <td>${formatCurrency(project.forecast || 0)}</td>
          <td>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${completion}%"></div>
            </div>
            <small>${completion.toFixed(0)}%</small>
          </td>
        </tr>
      `;
    }).join('');

    const currentDate = new Date();
    const monthName = currentDate.toLocaleDateString('sv-SE', { month: 'long' });
    const year = currentDate.getFullYear();

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f3f4f6; }
    .container { max-width: 900px; margin: 0 auto; background: white; }
    .header { text-align: center; padding: 40px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
    .header h1 { margin: 0 0 10px 0; font-size: 28px; }
    .content { padding: 40px 20px; }
    .summary-box { background: #f9fafb; padding: 30px; border-radius: 8px; margin: 20px 0; }
    .stats { display: flex; flex-wrap: wrap; justify-content: space-around; gap: 20px; }
    .stat { text-align: center; flex: 1; min-width: 150px; }
    .stat-value { font-size: 32px; font-weight: bold; color: #2563eb; margin-bottom: 5px; }
    .stat-label { font-size: 14px; color: #6b7280; }
    table { width: 100%; border-collapse: collapse; margin: 30px 0; }
    th { background: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; }
    td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge-success { background: #dcfce7; color: #166534; }
    .badge-warning { background: #fef3c7; color: #92400e; }
    .progress-bar { width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin-bottom: 4px; }
    .progress-fill { height: 100%; background: #3b82f6; }
    .footer { text-align: center; padding: 30px; background: #f9fafb; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Månatlig projektsammanfattning</h1>
      <p>${organization?.name || 'Din organisation'} - ${monthName} ${year}</p>
    </div>
    
    <div class="content">
      <div class="summary-box">
        <h2 style="margin-top: 0;">Översikt</h2>
        <div class="stats">
          <div class="stat">
            <div class="stat-value">${totalProjects}</div>
            <div class="stat-label">Pågående projekt</div>
          </div>
          <div class="stat">
            <div class="stat-value">${formatCurrency(totalBudget)}</div>
            <div class="stat-label">Total budget</div>
          </div>
          <div class="stat">
            <div class="stat-value">${formatCurrency(totalActual)}</div>
            <div class="stat-label">Utfall hittills</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color: ${parseFloat(budgetDeviation) > 0 ? '#dc2626' : '#16a34a'}">${parseFloat(budgetDeviation) > 0 ? '+' : ''}${budgetDeviation}%</div>
            <div class="stat-label">Budgetavvikelse</div>
          </div>
        </div>
      </div>
      
      ${totalProjects > 0 ? `
      <h2>Pågående projekt</h2>
      <table>
        <thead>
          <tr>
            <th>Projekt</th>
            <th>Fastighet</th>
            <th>Status</th>
            <th>Projektledare</th>
            <th>Budget</th>
            <th>Utfall</th>
            <th>Prognos</th>
            <th>Framsteg</th>
          </tr>
        </thead>
        <tbody>
          ${projectRows}
        </tbody>
      </table>
      ` : '<p style="text-align: center; color: #6b7280; padding: 40px 0;">Inga pågående projekt för tillfället.</p>'}
    </div>
    
    <div class="footer">
      <p>Detta är en automatisk rapport från ${organization?.name || 'ditt system'}</p>
      <p style="font-size: 12px; color: #9ca3af;">Genererad ${currentDate.toLocaleDateString('sv-SE')} ${currentDate.toLocaleTimeString('sv-SE')}</p>
    </div>
  </div>
</body>
</html>
    `;

    await resend.emails.send({
      from: 'Projektrapporter <info@liljeblads.com>',
      to: [userEmail],
      subject: `Månatlig projektsammanfattning - ${monthName} ${year}`,
      html: emailHtml,
    });

    const maskedEmail = userEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3');
    console.log(`Project summary sent to ${maskedEmail}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Project summary sent' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in send-monthly-project-summary:', error.message || 'Unknown error');
    return new Response(
      JSON.stringify({ error: 'Failed to send monthly project summary' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
